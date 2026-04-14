import { createHash } from "node:crypto";
import { load } from "cheerio";
import type {
  NormalizedMarketResult,
  ParsedQuery,
  SourceEngineResult,
  SourceExecutionMode,
  SourceId,
  SourceStatus
} from "../types";
import { withOriginMeta } from "../source-origin";

const USER_AGENT = "Mozilla/5.0 (compatible; CommodityTradingCRM/1.0; +https://example.com/contact)";
const REQUEST_TIMEOUT_MS = 12_000;

const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];
const BLOCKED_STATUS_CODES = new Set([401, 403, 406, 408, 409, 410, 412, 429, 451, 503, 520, 521, 522]);

type BrowserResponseLike = { status: () => number };
type BrowserPageLike = {
  goto: (
    url: string,
    options: { timeout: number; waitUntil: "domcontentloaded" }
  ) => Promise<BrowserResponseLike | null>;
  waitForTimeout: (ms: number) => Promise<void>;
  content: () => Promise<string>;
  close: () => Promise<void>;
};
type BrowserContextLike = {
  newPage: () => Promise<BrowserPageLike>;
  close: () => Promise<void>;
};
type BrowserLike = {
  newContext: (options: { userAgent: string; locale: string }) => Promise<BrowserContextLike>;
  close: () => Promise<void>;
};
type PlaywrightLike = {
  chromium?: {
    launch: (options: {
      headless: boolean;
      executablePath?: string;
      args: string[];
    }) => Promise<BrowserLike>;
  };
};

export class SourceFetchError extends Error {
  status?: number;
  blocked: boolean;
  antiBot: boolean;

  constructor(message: string, opts?: { status?: number; blocked?: boolean; antiBot?: boolean }) {
    super(message);
    this.name = "SourceFetchError";
    this.status = opts?.status;
    this.blocked = Boolean(opts?.blocked);
    this.antiBot = Boolean(opts?.antiBot);
  }
}

export const normalizeText = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
};

export const truncate = (value: string, max = 4000) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

export const slugify = (value: string) =>
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

export const parseIncoterms = (text: string) => {
  const upper = text.toUpperCase();
  return INCOTERMS.find((term) => new RegExp(`\\b${term}\\b`).test(upper)) || null;
};

const pickPattern = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return null;
};

export const parseFields = (text: string) => {
  const normalized = normalizeText(text);
  return {
    company: pickPattern(normalized, [
      /\b(?:company|buyer|supplier|manufacturer|seller)\s*[:\-]\s*([^|;]{2,120})/i,
      /\bby\s+([^|;,.]{2,90})/i
    ]),
    contact: pickPattern(normalized, [/\b(?:contact|attn|attention|person)\s*[:\-]\s*([^|;]{2,120})/i]),
    country: pickPattern(normalized, [/\b(?:country|location|from)\s*[:\-]\s*([a-zA-Z][a-zA-Z\s.&-]{1,80})/i]),
    quantity: pickPattern(normalized, [/\b(?:qty|quantity|volume|required quantity|min order)\s*[:\-]\s*([^|;]{1,120})/i]),
    paymentTerms: pickPattern(normalized, [/\b(?:payment terms?|payment)\s*[:\-]\s*([^|;]{1,120})/i]),
    shippingTerms: pickPattern(normalized, [/\b(?:shipping terms?|shipment terms?|incoterms?)\s*[:\-]\s*([^|;]{1,120})/i]),
    destination: pickPattern(normalized, [/\b(?:destination|delivery to|port of destination)\s*[:\-]\s*([^|;]{1,120})/i]),
    postedDate: pickPattern(normalized, [/\b(?:posted(?: on)?|date(?: posted)?|updated(?: on)?)\s*[:\-]\s*([^|;]{1,80})/i])
  };
};

const computeConfidence = (payload: {
  parsedQuery: ParsedQuery;
  title: string;
  snippet: string;
  hasCountry: boolean;
  hasQuantity: boolean;
  hasCompany: boolean;
}) => {
  const searchable = `${payload.title} ${payload.snippet}`.toLowerCase();
  const tokenHits = payload.parsedQuery.tokens.filter(
    (token) => token.length > 1 && searchable.includes(token.toLowerCase())
  ).length;
  const tokenScore = payload.parsedQuery.tokens.length > 0 ? tokenHits / payload.parsedQuery.tokens.length : 0.5;

  let score = 0.35 + tokenScore * 0.35;
  if (payload.hasCountry) score += 0.1;
  if (payload.hasQuantity) score += 0.1;
  if (payload.hasCompany) score += 0.1;

  return Number(Math.max(0.05, Math.min(0.99, score)).toFixed(2));
};

const buildResultId = (sourceName: string, sourceUrl: string, title: string) =>
  createHash("sha1").update(`${sourceName}|${sourceUrl}|${title}`).digest("hex").slice(0, 16);

export const isChallengePage = (html: string) =>
  /AwsWafIntegration|token\.awswaf\.com|challenge|verify that you'?re not a robot|captcha|enable javascript|cloudflare/i.test(
    html
  );

const getSourceStatus = (payload: {
  mode: SourceExecutionMode;
  blocked: boolean;
  warningsCount: number;
  extractedResults: number;
}): SourceStatus => {
  if (payload.mode === "manual") return "manual";
  if (payload.extractedResults > 0) return "ok";
  if (payload.blocked) return "blocked";
  if (payload.warningsCount > 0) return "error";
  return "ok";
};

export const extractVisibleTextFromHtml = (html: string) => {
  const $ = load(html);
  $("script, style, noscript, iframe, svg").remove();

  const primary = normalizeText($("main, article").first().text());
  const fallback = normalizeText($("body").text());
  return truncate(primary || fallback, 20000);
};

export const fetchPublicHtml = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8"
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });

    const status = response.status;
    const html = await response.text();

    if (!response.ok) {
      throw new SourceFetchError(`Source response ${status}`, {
        status,
        blocked: BLOCKED_STATUS_CODES.has(status)
      });
    }

    if (!html.trim()) {
      throw new SourceFetchError("Source returned empty HTML", { status });
    }

    if (isChallengePage(html)) {
      throw new SourceFetchError("Source is behind anti-bot challenge for plain server-side fetch", {
        status,
        blocked: true,
        antiBot: true
      });
    }

    return { html, status };
  } catch (error) {
    if (error instanceof SourceFetchError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceFetchError("Request timeout", { blocked: false });
    }

    throw new SourceFetchError(error instanceof Error ? error.message : "Fetch failed", { blocked: false });
  } finally {
    clearTimeout(timeout);
  }
};

const isPathAllowed = (href: string, includePathHints: string[], excludePathHints: string[]) => {
  try {
    const pathname = new URL(href).pathname.toLowerCase();
    if (!pathname || pathname === "/") return false;
    if (excludePathHints.some((hint) => pathname.includes(hint))) return false;
    if (includePathHints.length === 0) return true;
    return includePathHints.some((hint) => pathname.includes(hint));
  } catch {
    return false;
  }
};

export const parseGenericListingResults = (input: {
  html: string;
  pageUrl: string;
  sourceId: SourceId;
  sourceName: string;
  parsedQuery: ParsedQuery;
  resultTypeHint: string;
  maxResults: number;
  executionMode?: SourceExecutionMode;
  includePathHints?: string[];
  excludePathHints?: string[];
}) => {
  const $ = load(input.html);
  const results = new Map<string, NormalizedMarketResult>();

  const includePathHints = (input.includePathHints || []).map((item) => item.toLowerCase());
  const excludePathHints = [
    "login",
    "register",
    "contact",
    "privacy",
    "terms",
    ...(input.excludePathHints || []).map((item) => item.toLowerCase())
  ];

  const addResult = (payload: Omit<NormalizedMarketResult, "id">) => {
    const sourceUrl = normalizeText(payload.source_url);
    if (!sourceUrl || results.has(sourceUrl)) return;
    const title = normalizeText(payload.description.split("\n")[0] || payload.description);
    const normalized = withOriginMeta(
      {
      ...payload,
      id: buildResultId(input.sourceName, sourceUrl, title)
      },
      input.executionMode || "fetch"
    );
    results.set(sourceUrl, normalized);
  };

  $("script[type='application/ld+json']").each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = [parsed];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        if (typeof current === "object") {
          const record = current as Record<string, unknown>;
          const name = typeof record.name === "string" ? normalizeText(record.name) : "";
          const url = typeof record.url === "string" ? toAbsoluteUrl(record.url, input.pageUrl) : "";
          const description =
            typeof record.description === "string"
              ? normalizeText(record.description)
              : name || normalizeText(JSON.stringify(record));

          if (name.length >= 6 && url && isPathAllowed(url, includePathHints, excludePathHints)) {
            const fields = parseFields(description);
            const confidence = computeConfidence({
              parsedQuery: input.parsedQuery,
              title: name,
              snippet: description,
              hasCountry: Boolean(fields.country),
              hasQuantity: Boolean(fields.quantity),
              hasCompany: Boolean(fields.company)
            });

            addResult({
              product: input.parsedQuery.product,
              company: fields.company,
              contact_name: fields.contact,
              country: fields.country,
              quantity: fields.quantity,
              incoterms: parseIncoterms(`${fields.shippingTerms || ""} ${description}`),
              payment_terms: fields.paymentTerms,
              description: truncate(description, 1000),
              source_name: input.sourceName,
              source_url: url,
              raw_text: truncate(`${name}\n${description}`, 16000),
              result_type: input.resultTypeHint,
              confidence_score: confidence,
              shipping_terms: fields.shippingTerms,
              destination: fields.destination,
              posted_date: fields.postedDate
            });
          }

          Object.values(record).forEach((value) => queue.push(value));
        }
      }
    } catch {
      // ignore malformed payloads
    }
  });

  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const href = toAbsoluteUrl(anchor.attr("href") || "", input.pageUrl);
    const title = normalizeText(anchor.text());
    if (!href || title.length < 6 || title.length > 220) return;
    if (!isPathAllowed(href, includePathHints, excludePathHints)) return;

    const container = anchor.closest("article, li, tr, div, section");
    const snippetRaw = normalizeText(container.length ? container.text() : title);
    const snippet = snippetRaw || title;

    const searchable = `${title} ${snippet}`.toLowerCase();
    if (input.parsedQuery.tokens.length > 0) {
      const hasToken = input.parsedQuery.tokens.some(
        (token) => token.length > 1 && searchable.includes(token.toLowerCase())
      );
      if (!hasToken) return;
    }

    if (
      input.parsedQuery.target_country_or_region &&
      !searchable.includes(input.parsedQuery.target_country_or_region.toLowerCase())
    ) {
      const containerCountry = parseFields(snippet).country;
      if (
        !containerCountry ||
        !containerCountry.toLowerCase().includes(input.parsedQuery.target_country_or_region.toLowerCase())
      ) {
        return;
      }
    }

    const fields = parseFields(snippet);
    const confidence = computeConfidence({
      parsedQuery: input.parsedQuery,
      title,
      snippet,
      hasCountry: Boolean(fields.country),
      hasQuantity: Boolean(fields.quantity),
      hasCompany: Boolean(fields.company)
    });

    addResult({
      product: input.parsedQuery.product,
      company: fields.company,
      contact_name: fields.contact,
      country: fields.country,
      quantity: fields.quantity,
      incoterms: parseIncoterms(`${fields.shippingTerms || ""} ${snippet}`),
      payment_terms: fields.paymentTerms,
      description: truncate(snippet, 1000),
      source_name: input.sourceName,
      source_url: href,
      raw_text: truncate(`${title}\n${snippet}`, 16000),
      result_type: input.resultTypeHint,
      confidence_score: confidence,
      shipping_terms: fields.shippingTerms,
      destination: fields.destination,
      posted_date: fields.postedDate
    });
  });

  return Array.from(results.values()).slice(0, input.maxResults);
};

const buildEngineResult = (input: {
  sourceId: SourceId;
  sourceName: string;
  executionMode: SourceExecutionMode;
  fetchedUrls: string[];
  warnings: string[];
  httpStatuses: number[];
  blocked: boolean;
  antiBotDetected: boolean;
  sawHtml: boolean;
  results: NormalizedMarketResult[];
}): SourceEngineResult => {
  const parseStatus =
    input.executionMode === "manual"
      ? "skipped"
      : input.results.length > 0
        ? "success"
        : input.sawHtml
          ? "empty"
          : "failed";

  const status = getSourceStatus({
    mode: input.executionMode,
    blocked: input.blocked,
    warningsCount: input.warnings.length,
    extractedResults: input.results.length
  });

  return {
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    execution_mode: input.executionMode,
    fetchedUrls: input.fetchedUrls,
    warnings: input.warnings,
    http_statuses: input.httpStatuses,
    response_status: input.httpStatuses[0] ?? null,
    blocked: input.blocked,
    anti_bot_detected: input.antiBotDetected,
    parse_status: parseStatus,
    status,
    extracted_results: input.results.length,
    results: input.results
  };
};

export const runGenericSourceEngine = async (input: {
  sourceId: SourceId;
  sourceName: string;
  parsedQuery: ParsedQuery;
  searchUrls: string[];
  maxResults: number;
  resultTypeHint: string;
  includePathHints?: string[];
  excludePathHints?: string[];
  executionMode?: SourceExecutionMode;
}): Promise<SourceEngineResult> => {
  const dedupedUrls = Array.from(new Set(input.searchUrls));
  const fetchedUrls: string[] = [];
  const warnings: string[] = [];
  const httpStatuses: number[] = [];
  const merged = new Map<string, NormalizedMarketResult>();
  let blocked = false;
  let antiBotDetected = false;
  let sawHtml = false;

  for (const url of dedupedUrls) {
    fetchedUrls.push(url);

    try {
      const { html, status } = await fetchPublicHtml(url);
      httpStatuses.push(status);
      sawHtml = true;

      const parsed = parseGenericListingResults({
        html,
        pageUrl: url,
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        parsedQuery: input.parsedQuery,
        resultTypeHint: input.resultTypeHint,
        maxResults: input.maxResults,
        executionMode: input.executionMode || "fetch",
        includePathHints: input.includePathHints,
        excludePathHints: input.excludePathHints
      });

      parsed.forEach((item) => {
        if (!merged.has(item.source_url)) {
          merged.set(item.source_url, item);
        }
      });

      if (merged.size >= input.maxResults) break;
    } catch (error) {
      if (error instanceof SourceFetchError) {
        if (typeof error.status === "number") httpStatuses.push(error.status);
        blocked = blocked || error.blocked;
        antiBotDetected = antiBotDetected || error.antiBot;
        warnings.push(`${url}: ${error.message}`);
      } else {
        warnings.push(`${url}: ${error instanceof Error ? error.message : "Failed to fetch source"}`);
      }
    }
  }

  return buildEngineResult({
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    executionMode: input.executionMode || "fetch",
    fetchedUrls,
    warnings,
    httpStatuses,
    blocked,
    antiBotDetected,
    sawHtml,
    results: Array.from(merged.values()).slice(0, input.maxResults)
  });
};

const loadPlaywright = async () => {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<unknown>;

    return (await dynamicImport("playwright-core")) as PlaywrightLike;
  } catch {
    return null;
  }
};

export const runBrowserSourceEngine = async (input: {
  sourceId: SourceId;
  sourceName: string;
  parsedQuery: ParsedQuery;
  searchUrls: string[];
  maxResults: number;
  resultTypeHint: string;
  includePathHints?: string[];
  excludePathHints?: string[];
}): Promise<SourceEngineResult> => {
  const dedupedUrls = Array.from(new Set(input.searchUrls));
  const fetchedUrls: string[] = [];
  const warnings: string[] = [];
  const httpStatuses: number[] = [];
  const merged = new Map<string, NormalizedMarketResult>();

  let blocked = false;
  let antiBotDetected = false;
  let sawHtml = false;

  const playwright = await loadPlaywright();
  if (!playwright?.chromium) {
    return buildEngineResult({
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      executionMode: "browser",
      fetchedUrls,
      warnings: ["Browser mode unavailable: install playwright-core and configure PLAYWRIGHT_EXECUTABLE_PATH."],
      httpStatuses,
      blocked: false,
      antiBotDetected: false,
      sawHtml: false,
      results: []
    });
  }

  let browser: BrowserLike | null = null;
  let context: BrowserContextLike | null = null;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: ["--disable-dev-shm-usage", "--no-sandbox"]
    });

    context = await browser.newContext({ userAgent: USER_AGENT, locale: "en-US" });

    for (const url of dedupedUrls) {
      fetchedUrls.push(url);
      const page = await context.newPage();

      try {
        const response = await page.goto(url, {
          timeout: REQUEST_TIMEOUT_MS,
          waitUntil: "domcontentloaded"
        });

        await page.waitForTimeout(1200);

        const status = response?.status() ?? 200;
        httpStatuses.push(status);
        const html = await page.content();
        sawHtml = true;

        if (BLOCKED_STATUS_CODES.has(status)) {
          blocked = true;
          warnings.push(`${url}: Source response ${status}`);
          await page.close();
          continue;
        }

        if (isChallengePage(html)) {
          blocked = true;
          antiBotDetected = true;
          warnings.push(`${url}: Source challenge page detected in browser mode`);
          await page.close();
          continue;
        }

        const parsed = parseGenericListingResults({
          html,
          pageUrl: url,
          sourceId: input.sourceId,
          sourceName: input.sourceName,
          parsedQuery: input.parsedQuery,
          resultTypeHint: input.resultTypeHint,
          maxResults: input.maxResults,
          executionMode: "browser",
          includePathHints: input.includePathHints,
          excludePathHints: input.excludePathHints
        });

        parsed.forEach((item) => {
          if (!merged.has(item.source_url)) {
            merged.set(item.source_url, item);
          }
        });

        await page.close();

        if (merged.size >= input.maxResults) break;
      } catch (error) {
        warnings.push(`${url}: ${error instanceof Error ? error.message : "Browser fetch failed"}`);
        await page.close();
      }
    }
  } catch (error) {
    warnings.push(`Browser launch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    try {
      await context?.close();
    } catch {
      // noop
    }

    try {
      await browser?.close();
    } catch {
      // noop
    }
  }

  return buildEngineResult({
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    executionMode: "browser",
    fetchedUrls,
    warnings,
    httpStatuses,
    blocked,
    antiBotDetected,
    sawHtml,
    results: Array.from(merged.values()).slice(0, input.maxResults)
  });
};
