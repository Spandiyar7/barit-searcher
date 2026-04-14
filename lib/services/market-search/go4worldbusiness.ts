import { createHash } from "node:crypto";
import { LeadPriority, LeadStatus, LeadType } from "@prisma/client";
import { load } from "cheerio";
import { summarizeLead, suggestNextActions } from "@/lib/ai";
import { prisma } from "@/lib/db/prisma";
import { findProductByNameOrSynonym } from "@/lib/services/products";
import { tokenizeSearch } from "@/lib/utils/query";
import type {
  ImportMarketSearchInput,
  ImportMarketSearchResponse,
  MarketSearchInput,
  MarketSearchResponse,
  MarketSearchResult
} from "./types";

const BASE_URL = "https://www.go4worldbusiness.com";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 30;
const DEFAULT_PRODUCT_NAME = "Uncategorized Commodity";

const USER_AGENT =
  "Mozilla/5.0 (compatible; CommodityTradingCRM/1.0; +https://example.com/contact)";

const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];

const normalizeText = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (value: string, max = 2000) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

const toAbsoluteUrl = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
};

const buildResultId = (sourceUrl: string, title: string) =>
  createHash("sha1").update(`${sourceUrl}|${title}`).digest("hex").slice(0, 14);

const pickPattern = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return null;
};

const parseIncoterms = (text: string) => {
  const upper = text.toUpperCase();
  for (const term of INCOTERMS) {
    if (new RegExp(`\\b${term}\\b`).test(upper)) return term;
  }
  return null;
};

const parseVolumeAndUnit = (quantity: string | null, text: string) => {
  const source = normalizeText(`${quantity || ""} ${text}`);
  const numeric = source.match(/(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!numeric?.[1]) return { volume: null as number | null, unit: null as string | null };
  const value = Number(numeric[1].replace(/[,\s]/g, ""));
  if (!Number.isFinite(value)) return { volume: null as number | null, unit: null as string | null };

  const unitMatch = source.match(
    /\b(mt|ton|tons|tonne|tonnes|kg|kgs|lb|lbs|bag|bags|container|containers|m3|cbm)\b/i
  );
  return { volume: value, unit: unitMatch ? unitMatch[1].toUpperCase() : null };
};

const parsePriceAndCurrency = (text: string) => {
  const currencyMatch = text.match(/\b(USD|EUR|AED|CNY|RUB|TRY|INR|GBP)\b/i);
  const symbolMatch = text.match(/(?:US\$|\$|€)\s?(\d+(?:[,\s]\d{3})*(?:\.\d+)?)/i);
  const codeMatch = text.match(/\b(?:Price|Rate)\s*[:\-]?\s*(\d+(?:[,\s]\d{3})*(?:\.\d+)?)/i);
  const currency = currencyMatch ? currencyMatch[1].toUpperCase() : symbolMatch ? "USD" : null;
  const valueRaw = symbolMatch?.[1] || codeMatch?.[1] || null;
  if (!valueRaw) return { price: null as number | null, currency };
  const value = Number(valueRaw.replace(/[,\s]/g, ""));
  return { price: Number.isFinite(value) ? value : null, currency };
};

const parsePublishedAt = (postedDate: string | null) => {
  if (!postedDate) return null;
  const date = new Date(postedDate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const isChallengePage = (html: string) =>
  /AwsWafIntegration|token\.awswaf\.com|challenge-container|verify that you'?re not a robot/i.test(html);

const extractFields = (text: string) => {
  const normalized = normalizeText(text);

  return {
    country: pickPattern(normalized, [
      /\bCountry\s*[:\-]\s*([a-zA-Z][a-zA-Z\s.&-]{1,60})/i,
      /\bFrom\s*[:\-]\s*([a-zA-Z][a-zA-Z\s.&-]{1,60})/i
    ]),
    quantity: pickPattern(normalized, [
      /\b(?:Qty|Quantity|Volume|Required Quantity)\s*[:\-]\s*([^|;]{1,80})/i
    ]),
    paymentTerms: pickPattern(normalized, [/\b(?:Payment Terms?|Payment)\s*[:\-]\s*([^|;]{1,120})/i]),
    shippingTerms: pickPattern(normalized, [/\b(?:Shipping Terms?|Shipment Terms?|Incoterms?)\s*[:\-]\s*([^|;]{1,120})/i]),
    destination: pickPattern(normalized, [/\b(?:Destination|Delivery To|Port of Destination)\s*[:\-]\s*([^|;]{1,120})/i]),
    postedDate: pickPattern(normalized, [/\b(?:Posted(?: on)?|Date(?: Posted)?)\s*[:\-]\s*([^|;]{1,80})/i]),
    companyName: pickPattern(normalized, [/\b(?:Buyer|Supplier|Company)\s*[:\-]\s*([^|;]{2,120})/i])
  };
};

const isLikelyListingUrl = (url: string, mode: MarketSearchInput["mode"], tokens: string[]) => {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }

  if (!path || path === "/" || path.startsWith("/contact") || path.startsWith("/about")) return false;
  if (path.includes("/find-buyers/") || path.includes("/find-suppliers/")) return true;

  const genericHint = /(trade|lead|offer|requirement|wanted|buy|sell|buyer|supplier)/.test(path);
  const modeHint =
    mode === "buyers" ? /(buyer|buy|import)/.test(path) : /(supplier|sell|export)/.test(path);
  const tokenHint = tokens.some((token) => token.length > 2 && path.includes(token.toLowerCase()));

  return genericHint && (modeHint || tokenHint);
};

const parseResultsFromHtml = (html: string, pageUrl: string, input: MarketSearchInput) => {
  const $ = load(html);
  const tokens = tokenizeSearch(input.keyword);
  const collected = new Map<string, MarketSearchResult>();

  const addResult = (result: Omit<MarketSearchResult, "id">) => {
    const sourceUrl = result.sourceUrl.trim();
    const title = normalizeText(result.title);
    if (!sourceUrl || !title) return;
    const id = buildResultId(sourceUrl, title);
    if (collected.has(sourceUrl)) return;
    collected.set(sourceUrl, {
      ...result,
      id,
      title: truncate(title, 255),
      snippet: truncate(normalizeText(result.snippet), 4000)
    });
  };

  $("script[type='application/ld+json']").each((_, element) => {
    const jsonText = $(element).text().trim();
    if (!jsonText) return;

    try {
      const parsed = JSON.parse(jsonText) as unknown;
      const queue: unknown[] = [parsed];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        if (typeof current === "object") {
          const item = current as Record<string, unknown>;
          if (typeof item.url === "string" && typeof item.name === "string") {
            addResult({
              title: item.name,
              companyName: null,
              country: null,
              quantity: null,
              paymentTerms: null,
              shippingTerms: null,
              destination: null,
              sourceUrl: toAbsoluteUrl(item.url, BASE_URL),
              snippet: item.description ? String(item.description) : String(item.name),
              postedDate: null,
              mode: input.mode
            });
          }

          Object.values(item).forEach((value) => queue.push(value));
        }
      }
    } catch {
      // Ignore malformed JSON-LD chunks.
    }
  });

  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const href = toAbsoluteUrl(anchor.attr("href") || "", pageUrl);
    const title = normalizeText(anchor.text());

    if (!href || title.length < 8 || title.length > 250) return;
    if (!isLikelyListingUrl(href, input.mode, tokens)) return;

    const container = anchor.closest("article, li, tr, section, div");
    const snippetRaw = normalizeText((container.length ? container.text() : anchor.text()) || "");
    const snippet = snippetRaw || title;

    if (tokens.length > 0) {
      const searchable = `${title} ${snippet}`.toLowerCase();
      const hasToken = tokens.some((token) => searchable.includes(token.toLowerCase()));
      if (!hasToken) return;
    }

    const extracted = extractFields(snippet);
    addResult({
      title,
      companyName: extracted.companyName,
      country: extracted.country,
      quantity: extracted.quantity,
      paymentTerms: extracted.paymentTerms,
      shippingTerms: extracted.shippingTerms,
      destination: extracted.destination,
      sourceUrl: href,
      snippet,
      postedDate: extracted.postedDate,
      mode: input.mode
    });
  });

  let results = Array.from(collected.values());

  if (input.country) {
    const countryNeedle = input.country.toLowerCase();
    results = results.filter((item) =>
      `${item.country || ""} ${item.destination || ""} ${item.snippet}`.toLowerCase().includes(countryNeedle)
    );
  }

  return results.slice(0, MAX_RESULTS);
};

const fetchHtml = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8"
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Source response ${response.status}`);
    }

    const html = await response.text();
    if (!html.trim()) {
      throw new Error("Source returned empty HTML");
    }

    if (isChallengePage(html)) {
      throw new Error("Source is protected by anti-bot challenge and cannot be parsed with plain server fetch.");
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
};

export const buildGo4WorldBusinessSearchUrls = (input: MarketSearchInput) => {
  const keywordSlug = slugify(input.keyword);
  const countrySlug = slugify(input.country || "");
  const basePath = input.mode === "buyers" ? "find-buyers" : "find-suppliers";
  const urls = [
    `${BASE_URL}/${basePath}/${keywordSlug}.html`,
    `${BASE_URL}/${basePath}/${keywordSlug}/`,
    `${BASE_URL}/${basePath}/?keywords=${encodeURIComponent(input.keyword)}`,
    `${BASE_URL}/search/?q=${encodeURIComponent(input.keyword)}`
  ];

  if (countrySlug) {
    urls.push(`${BASE_URL}/${basePath}/${keywordSlug}/${countrySlug}.html`);
    urls.push(
      `${BASE_URL}/${basePath}/?keywords=${encodeURIComponent(input.keyword)}&country=${encodeURIComponent(
        input.country || ""
      )}`
    );
  }

  return Array.from(new Set(urls));
};

export const searchGo4WorldBusiness = async (input: MarketSearchInput): Promise<MarketSearchResponse> => {
  const query: MarketSearchInput = {
    keyword: normalizeText(input.keyword),
    mode: input.mode,
    country: normalizeText(input.country || "")
  };

  const searchUrls = buildGo4WorldBusinessSearchUrls(query);
  const fetchedUrls: string[] = [];
  const warnings: string[] = [];
  const allResults = new Map<string, MarketSearchResult>();
  let fetchFailures = 0;

  for (const url of searchUrls) {
    fetchedUrls.push(url);
    try {
      const html = await fetchHtml(url);
      const parsed = parseResultsFromHtml(html, url, query);
      parsed.forEach((item) => {
        if (!allResults.has(item.sourceUrl)) {
          allResults.set(item.sourceUrl, item);
        }
      });

      if (allResults.size >= MAX_RESULTS) break;
    } catch (error) {
      fetchFailures += 1;
      warnings.push(`${url}: ${error instanceof Error ? error.message : "Failed to fetch source page"}`);
    }
  }

  const results = Array.from(allResults.values()).slice(0, MAX_RESULTS);

  if (results.length === 0 && fetchFailures === searchUrls.length) {
    throw new Error("Could not fetch go4WorldBusiness listings right now. Please try again later.");
  }

  return {
    source: "go4WorldBusiness",
    query,
    fetchedUrls,
    warnings,
    results
  };
};

const findOrCreateFallbackProductId = async () => {
  const existing = await prisma.product.findFirst({
    where: { name: { equals: DEFAULT_PRODUCT_NAME, mode: "insensitive" } },
    select: { id: true }
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.product.create({
      data: {
        name: DEFAULT_PRODUCT_NAME,
        category: "General",
        synonyms: []
      },
      select: { id: true }
    });
    return created.id;
  } catch {
    const retry = await prisma.product.findFirst({
      where: { name: { equals: DEFAULT_PRODUCT_NAME, mode: "insensitive" } },
      select: { id: true }
    });
    if (retry) return retry.id;
  }

  const fallback = await prisma.product.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  if (!fallback) throw new Error("No products available to link imported lead.");
  return fallback.id;
};

const resolveProductId = async (input: ImportMarketSearchInput) => {
  const candidates = [input.result.title, input.keyword || ""];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const product = await findProductByNameOrSynonym(candidate);
    if (product) return product.id;
  }
  return findOrCreateFallbackProductId();
};

export const importGo4WorldBusinessLead = async (
  input: ImportMarketSearchInput
): Promise<ImportMarketSearchResponse> => {
  const sourceUrl = normalizeText(input.result.sourceUrl);
  if (!sourceUrl) throw new Error("Source URL is required for import.");

  const duplicate = await prisma.lead.findFirst({
    where: {
      sourceUrl: {
        equals: sourceUrl,
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  if (duplicate) {
    return {
      status: "duplicate",
      leadId: duplicate.id,
      message: "Already imported"
    };
  }

  const productId = await resolveProductId(input);
  const leadType = input.result.mode === "buyers" ? LeadType.BUY : LeadType.SELL;
  const combinedText = normalizeText(
    [
      input.result.title,
      input.result.snippet,
      input.result.quantity,
      input.result.paymentTerms,
      input.result.shippingTerms,
      input.result.destination
    ]
      .filter(Boolean)
      .join(" | ")
  );

  const { volume, unit } = parseVolumeAndUnit(input.result.quantity, combinedText);
  const { price, currency } = parsePriceAndCurrency(combinedText);
  const incoterms = parseIncoterms(`${input.result.shippingTerms || ""} ${combinedText}`);
  const publishedAt = parsePublishedAt(input.result.postedDate);

  let aiSummary: string | null = null;
  let aiActions: string[] = [];

  if (input.withAi) {
    aiSummary = await summarizeLead({
      title: input.result.title,
      rawText: combinedText,
      product: input.keyword || input.result.title,
      leadType,
      volume,
      unit,
      price,
      currency,
      incoterms,
      originCountry: input.result.mode === "suppliers" ? input.result.country : null,
      destinationCountry:
        input.result.destination || (input.result.mode === "buyers" ? input.result.country : null)
    });
    aiActions = await suggestNextActions({
      title: input.result.title,
      rawText: combinedText,
      product: input.keyword || input.result.title,
      leadType,
      volume,
      unit,
      price,
      currency,
      incoterms,
      originCountry: input.result.mode === "suppliers" ? input.result.country : null,
      destinationCountry:
        input.result.destination || (input.result.mode === "buyers" ? input.result.country : null)
    });
  }

  const rawText = truncate(
    [
      `Source: go4WorldBusiness`,
      `Mode: ${input.result.mode}`,
      `Title: ${input.result.title}`,
      input.result.companyName ? `Company: ${input.result.companyName}` : "",
      input.result.country ? `Country: ${input.result.country}` : "",
      input.result.quantity ? `Quantity: ${input.result.quantity}` : "",
      input.result.paymentTerms ? `Payment Terms: ${input.result.paymentTerms}` : "",
      input.result.shippingTerms ? `Shipping Terms: ${input.result.shippingTerms}` : "",
      input.result.destination ? `Destination: ${input.result.destination}` : "",
      input.result.postedDate ? `Posted Date: ${input.result.postedDate}` : "",
      `Source URL: ${sourceUrl}`,
      `Snippet: ${input.result.snippet}`
    ]
      .filter(Boolean)
      .join("\n"),
    19000
  );

  const lead = await prisma.lead.create({
    data: {
      title: truncate(input.result.title, 255),
      productId,
      companyId: null,
      leadType,
      volume,
      unit,
      price,
      currency,
      incoterms,
      originCountry: input.result.mode === "suppliers" ? input.result.country : null,
      destinationCountry:
        input.result.destination || (input.result.mode === "buyers" ? input.result.country : null),
      sourceName: "go4WorldBusiness",
      sourceUrl,
      rawText,
      aiSummary,
      priority: LeadPriority.MEDIUM,
      status: LeadStatus.NEW,
      publishedAt
    },
    select: { id: true }
  });

  return {
    status: "imported",
    leadId: lead.id,
    message: "Import successful",
    aiActions
  };
};
