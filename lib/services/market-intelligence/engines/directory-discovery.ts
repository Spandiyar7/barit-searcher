import { createHash } from "node:crypto";
import { load } from "cheerio";
import { enrichCompanyFromMarketResult } from "@/lib/services/company-enrichment";
import type { NormalizedMarketResult, ParsedQuery, SourceEngineResult, SourceExecutionMode, SourceId } from "../types";
import { withOriginMeta } from "../source-origin";
import {
  extractVisibleTextFromHtml,
  fetchPublicHtml,
  normalizeText,
  runBrowserSourceEngine,
  runGenericSourceEngine,
  truncate
} from "./shared";

type DirectoryDiscoveryInput = {
  sourceId: SourceId;
  sourceName: string;
  parsedQuery: ParsedQuery;
  searchUrls: string[];
  maxResults: number;
  includePathHints: string[];
  excludePathHints?: string[];
  executionMode?: SourceExecutionMode;
};

const MARKETPLACE_HOST_HINTS = [
  "kompass.com",
  "europages.com",
  "go4worldbusiness.com",
  "tradewheel.com",
  "tradekey.com",
  "alibaba.com",
  "ec21.com",
  "exporthub.com",
  "petrochemz.com",
  "globy.com",
  "toocle.com",
  "chemnet.com",
  "plastic4trade.com"
];

const SOCIAL_HOST_HINTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "t.me",
  "telegram.me",
  "wa.me",
  "whatsapp.com"
];

const COMPANY_SUFFIX_RE =
  /\b(?:llc|ltd|limited|inc|corp|corporation|co\.?|company|gmbh|sarl|sas|s\.?a\.?|ag|bv|pte|fze|dmcc|oy|srl)\b/i;

const toAbsoluteUrl = (href: string, base: string) => {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
};

const getHost = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

const normalizeCompanyToken = (value: string) =>
  normalizeText(value)
    .toLowerCase()
    .replace(
      /\b(llc|ltd|limited|inc|corp|corporation|co|company|gmbh|sarl|sas|sa|ag|bv|pte|fze|dmcc|oy|srl)\b/g,
      " "
    )
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isLikelyCompanyWebsite = (candidateUrl: string, sourceHost: string) => {
  const host = getHost(candidateUrl);
  if (!host) return false;
  if (host === sourceHost) return false;
  if (MARKETPLACE_HOST_HINTS.some((item) => host.includes(item))) return false;
  if (SOCIAL_HOST_HINTS.some((item) => host.includes(item))) return false;
  return true;
};

const extractWebsiteFromText = (text: string) => {
  const urls = text.match(/(?:https?:\/\/|www\.)[^\s<>"')]+/gi) || [];
  for (const item of urls) {
    const normalized = item.startsWith("http") ? item : `https://${item}`;
    try {
      return new URL(normalized).toString();
    } catch {
      // ignore
    }
  }
  return null;
};

const detectRoleType = (parsedQuery: ParsedQuery) => {
  const queryLower = parsedQuery.query.toLowerCase();
  if (/\bdistributor(s)?\b/.test(queryLower)) {
    return { role: "distributor", resultType: "distributor_directory" };
  }
  if (parsedQuery.intent === "importers" || parsedQuery.intent === "buyers") {
    return { role: "importer", resultType: "importer_directory" };
  }
  if (parsedQuery.intent === "suppliers" || parsedQuery.intent === "manufacturers" || parsedQuery.intent === "exporters") {
    return { role: "supplier", resultType: "supplier_directory" };
  }
  return { role: "company", resultType: "company_profile" };
};

const confidenceForResult = (payload: {
  parsedQuery: ParsedQuery;
  text: string;
  hasWebsite: boolean;
  hasContact: boolean;
  hasCountry: boolean;
}) => {
  const lowered = payload.text.toLowerCase();
  const hits = payload.parsedQuery.tokens.filter((token) => token.length > 1 && lowered.includes(token.toLowerCase())).length;
  const tokenScore = payload.parsedQuery.tokens.length ? hits / payload.parsedQuery.tokens.length : 0.5;

  let score = 0.34 + tokenScore * 0.36;
  if (payload.hasWebsite) score += 0.14;
  if (payload.hasContact) score += 0.12;
  if (payload.hasCountry) score += 0.08;

  return Number(Math.max(0.18, Math.min(score, 0.96)).toFixed(2));
};

const extractCategoryHint = (html: string) => {
  const $ = load(html);
  const breadcrumb = normalizeText(
    $(".breadcrumb, .breadcrumbs, nav[aria-label='breadcrumb']")
      .first()
      .text()
  );
  if (breadcrumb) return truncate(breadcrumb, 140);

  const heading = normalizeText($("h1, h2").first().text());
  return heading ? truncate(heading, 120) : null;
};

const parseCompanyLinesFromText = (text: string) => {
  const lineSet = new Set<string>();
  const splitByLine = text
    .split(/\n+|[;|•]+|\.\s+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);

  splitByLine.forEach((line) => {
    if (line.length < 5 || line.length > 140) return;
    if (COMPANY_SUFFIX_RE.test(line) || /\b(importer|exporter|supplier|manufacturer|distributor)\b/i.test(line)) {
      lineSet.add(line);
    }
  });

  if (lineSet.size === 0) {
    const sentenceLike = text.match(/[A-Z][A-Za-z0-9&().,'\-\/\s]{8,120}/g) || [];
    sentenceLike.forEach((line) => {
      const cleaned = normalizeText(line);
      if (!cleaned || cleaned.length < 8 || cleaned.length > 120) return;
      if (COMPANY_SUFFIX_RE.test(cleaned)) lineSet.add(cleaned);
    });
  }

  return Array.from(lineSet).slice(0, 12);
};

const scoreWebsiteForCompany = (companyName: string, websiteUrl: string) => {
  const host = getHost(websiteUrl).replace(/\.[a-z]{2,}$/i, "");
  if (!host) return 0;
  const companyToken = normalizeCompanyToken(companyName);
  if (!companyToken) return 0;
  const words = companyToken.split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const matched = words.filter((word) => word.length >= 3 && host.includes(word)).length;
  return matched / words.length;
};

const extractFallbackTextCandidates = (payload: {
  html: string;
  pageUrl: string;
  sourceHost: string;
  parsedQuery: ParsedQuery;
  sourceName: string;
  sourceId: SourceId;
  executionMode: SourceExecutionMode;
  role: string;
  resultType: string;
}) => {
  const $ = load(payload.html);
  const pageText = extractVisibleTextFromHtml(payload.html);
  const lines = parseCompanyLinesFromText(pageText);
  if (lines.length === 0) return [];

  const externalUrls = new Set<string>();
  $("a[href]").each((_, element) => {
    const href = normalizeText($(element).attr("href"));
    if (!href) return;
    const abs = toAbsoluteUrl(href, payload.pageUrl);
    if (!abs) return;
    if (isLikelyCompanyWebsite(abs, payload.sourceHost)) {
      externalUrls.add(abs);
    }
  });

  const urlPool = Array.from(externalUrls);
  return lines.map((company, index) => {
    let website: string | null = null;
    const inlineWebsite = extractWebsiteFromText(company);
    if (inlineWebsite && isLikelyCompanyWebsite(inlineWebsite, payload.sourceHost)) {
      website = inlineWebsite;
    } else if (urlPool.length > 0) {
      let bestScore = 0;
      let bestWebsite = "";
      urlPool.forEach((candidate) => {
        const score = scoreWebsiteForCompany(company, candidate);
        if (score > bestScore) {
          bestScore = score;
          bestWebsite = candidate;
        }
      });
      website = bestWebsite || urlPool[0] || null;
    }

    const sourceUrl = website || `${payload.pageUrl}#fallback-${index + 1}`;
    const rawText = [
      `Company: ${company}`,
      `Role: ${payload.role}`,
      payload.parsedQuery.target_country_or_region ? `Country: ${payload.parsedQuery.target_country_or_region}` : "",
      website ? `Website: ${website}` : "",
      `Source listing: ${payload.pageUrl}`
    ]
      .filter(Boolean)
      .join("\n");

    const confidence = confidenceForResult({
      parsedQuery: payload.parsedQuery,
      text: rawText,
      hasWebsite: Boolean(website),
      hasContact: false,
      hasCountry: Boolean(payload.parsedQuery.target_country_or_region)
    });

    return withOriginMeta(
      {
        id: createHash("sha1").update(`${payload.sourceId}|${sourceUrl}|${company}`).digest("hex").slice(0, 16),
        product: payload.parsedQuery.product,
        company,
        contact_name: null,
        country: payload.parsedQuery.target_country_or_region,
        quantity: null,
        incoterms: null,
        payment_terms: null,
        description: truncate(`${company}. ${payload.role} signal from listing text.`, 900),
        source_name: payload.sourceName,
        source_url: sourceUrl,
        raw_text: truncate(rawText, 16000),
        result_type: payload.resultType,
        confidence_score: confidence,
        shipping_terms: null,
        destination: payload.parsedQuery.destination_country || null,
        posted_date: null,
        acquisition_origin: payload.executionMode === "browser" ? "browser_fallback" : "directory_page"
      },
      payload.executionMode
    );
  });
};

const enrichDirectoryResult = async (
  result: NormalizedMarketResult,
  parsedQuery: ParsedQuery,
  executionMode: SourceExecutionMode,
  role: string,
  resultType: string
) => {
  const foodAgri = parsedQuery.product_category === "food_agriculture";
  const enrichment = await enrichCompanyFromMarketResult(result, {
    preferDirectWebsite: foodAgri,
    companyCountry: parsedQuery.target_country_or_region || result.country || null,
    productHint: parsedQuery.product || result.product || null
  });
  let categoryFromPage = "";
  if (!result.product) {
    try {
      const { html } = await fetchPublicHtml(result.source_url);
      categoryFromPage = extractCategoryHint(html) || "";
    } catch {
      // best-effort only
    }
  }

  const hasContact = Boolean(
    enrichment.email || enrichment.phone || enrichment.telegram || enrichment.whatsapp || enrichment.contactName
  );

  const mergedCompany = normalizeText(result.company || enrichment.companyName || "");
  const mergedCountry = normalizeText(result.country || enrichment.country || parsedQuery.target_country_or_region || "");
  const mergedContact = normalizeText(result.contact_name || enrichment.contactName || "");
  const mergedWebsite = normalizeText(enrichment.website || "");
  const contactSummary = normalizeText(enrichment.email || enrichment.phone || enrichment.whatsapp || enrichment.telegram || "");

  const categoryNote = result.product || parsedQuery.product || categoryFromPage;
  const description = truncate(
    [
      mergedCompany || "Company",
      mergedCountry ? `(${mergedCountry})` : "",
      `${role} profile`,
      categoryNote ? `for ${categoryNote}` : "",
      mergedWebsite ? `website: ${mergedWebsite}` : "",
      contactSummary ? `contact: ${contactSummary}` : ""
    ]
      .filter(Boolean)
      .join(" "),
    900
  );

  const rawText = truncate(
    [
      result.raw_text,
      mergedWebsite ? `Website: ${mergedWebsite}` : "",
      enrichment.contactPageUrl ? `Contact page: ${enrichment.contactPageUrl}` : "",
      enrichment.email ? `Email: ${enrichment.email}` : "",
      enrichment.phone ? `Phone: ${enrichment.phone}` : "",
      enrichment.telegram ? `Telegram: ${enrichment.telegram}` : "",
      enrichment.whatsapp ? `WhatsApp: ${enrichment.whatsapp}` : "",
      mergedContact ? `Contact: ${mergedContact}` : "",
      mergedCountry ? `Country: ${mergedCountry}` : "",
      categoryNote ? `Category/Product: ${categoryNote}` : "",
      `Role: ${role}`
    ]
      .filter(Boolean)
      .join("\n"),
    17000
  );

  const confidence = confidenceForResult({
    parsedQuery,
    text: `${description}\n${rawText}`,
    hasWebsite: Boolean(mergedWebsite),
    hasContact,
    hasCountry: Boolean(mergedCountry)
  });

  const acquisitionOrigin: NormalizedMarketResult["acquisition_origin"] =
    enrichment.websiteCrawled || enrichment.websiteResolvedBySearch
      ? "company_website"
      : executionMode === "browser"
        ? "browser_fallback"
        : "directory_page";

  return {
    ...result,
    company: mergedCompany || result.company,
    contact_name: mergedContact || result.contact_name,
    country: mergedCountry || result.country,
    description,
    raw_text: rawText,
    result_type: resultType,
    confidence_score: Math.max(result.confidence_score, confidence),
    acquisition_origin: acquisitionOrigin
  } satisfies NormalizedMarketResult;
};

const finalizeResults = (results: NormalizedMarketResult[], maxResults: number) => {
  const byKey = new Map<string, NormalizedMarketResult>();

  results.forEach((item) => {
    const website = extractWebsiteFromText(item.raw_text || item.description || "");
    const dedupeKey = website ? `${item.source_name}|${website.toLowerCase()}` : `${item.source_name}|${item.source_url}`;
    const existing = byKey.get(dedupeKey);
    if (!existing || item.confidence_score > existing.confidence_score) {
      byKey.set(dedupeKey, item);
    }
  });

  return Array.from(byKey.values())
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, maxResults);
};

export const runDirectoryDiscoveryEngine = async (input: DirectoryDiscoveryInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || "fetch";
  const roleInfo = detectRoleType(input.parsedQuery);
  const basePayload = {
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    parsedQuery: input.parsedQuery,
    searchUrls: input.searchUrls,
    maxResults: Math.max(input.maxResults, 12),
    resultTypeHint: roleInfo.resultType,
    includePathHints: input.includePathHints,
    excludePathHints: input.excludePathHints
  };

  const baseResult =
    executionMode === "browser"
      ? await runBrowserSourceEngine(basePayload)
      : await runGenericSourceEngine({ ...basePayload, executionMode: "fetch" });

  const enriched: NormalizedMarketResult[] = [];

  for (const result of baseResult.results.slice(0, Math.min(baseResult.results.length, 10))) {
    try {
      const item = await enrichDirectoryResult(result, input.parsedQuery, executionMode, roleInfo.role, roleInfo.resultType);
      enriched.push(withOriginMeta(item, executionMode));
    } catch {
      enriched.push(
        withOriginMeta(
          {
            ...result,
            result_type: roleInfo.resultType,
            acquisition_origin: executionMode === "browser" ? "browser_fallback" : "directory_page"
          },
          executionMode
        )
      );
    }
  }

  const fallbackResults: NormalizedMarketResult[] = [];
  if (enriched.length === 0) {
    const sourceHost = input.searchUrls.map(getHost).find(Boolean) || "";
    for (const url of baseResult.fetchedUrls.slice(0, 4)) {
      try {
        const { html } = await fetchPublicHtml(url);

        const categoryHint = extractCategoryHint(html);
        const extracted = extractFallbackTextCandidates({
          html,
          pageUrl: url,
          sourceHost,
          parsedQuery: input.parsedQuery,
          sourceName: input.sourceName,
          sourceId: input.sourceId,
          executionMode,
          role: roleInfo.role,
          resultType: roleInfo.resultType
        }).map((item) => {
          if (!categoryHint) return item;
          return {
            ...item,
            description: truncate(`${item.description}. Category: ${categoryHint}`, 900),
            raw_text: truncate(`${item.raw_text}\nCategory: ${categoryHint}`, 17000)
          };
        });

        fallbackResults.push(...extracted);
      } catch {
        // keep fallback best-effort
      }
    }
  }

  const finalResults = finalizeResults(enriched.length > 0 ? enriched : fallbackResults, input.maxResults);
  const finalParseStatus = finalResults.length > 0 ? "success" : baseResult.parse_status;
  const finalStatus = finalResults.length > 0 ? "ok" : baseResult.status;

  return {
    ...baseResult,
    parse_status: finalParseStatus,
    status: finalStatus,
    extracted_results: finalResults.length,
    results: finalResults
  };
};
