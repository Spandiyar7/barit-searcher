import { createHash } from "node:crypto";
import { load } from "cheerio";
import { enrichCompanyFromMarketResult } from "@/lib/services/company-enrichment";
import { buildCompanyFirstQueryVariants } from "@/lib/services/market-intelligence/company-discovery";
import type { NormalizedMarketResult, SourceEngineInput, SourceEngineResult } from "../types";
import { withOriginMeta } from "../source-origin";
import { fetchPublicHtml, normalizeText, parseFields, runBrowserSourceEngine, truncate } from "./shared";

type SearchCandidate = {
  title: string;
  snippet: string;
  url: string;
  score: number;
  query: string;
};

const COUNTRY_TLDS: Record<string, string[]> = {
  uzbekistan: [".uz"],
  turkey: [".tr"],
  india: [".in"],
  china: [".cn"],
  kazakhstan: [".kz"],
  russia: [".ru"],
  "saudi arabia": [".sa"],
  uae: [".ae"]
};

const EXCLUDED_HOST_HINTS = [
  "kompass.com",
  "europages.com",
  "alibaba.com",
  "go4worldbusiness.com",
  "tradekey.com",
  "tradewheel.com",
  "ec21.com",
  "exporthub.com",
  "globaltradeplaza.com",
  "globy.com",
  "made-in-china.com",
  "indiamart.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "wikipedia.org",
  "zhihu.com",
  "baidu.com",
  "reddit.com",
  "quora.com"
];
const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_USER_AGENT = "Mozilla/5.0 (compatible; CommodityTradingCRM/1.0; +https://example.com/contact)";
const resolvedSearchUrlCache = new Map<string, string | null>();
const BING_SOFT_NEGATIVE_SITE_TOKENS = ["-site:kompass.com", "-site:europages.com"];
const NON_COMPANY_TEXT_PATTERN =
  /\b(wikipedia|market report|by country|what is|definition|dictionary|forum|reddit|quora|news|video|youtube|health|medical)\b/i;

const toHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

const toRootUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return url;
  }
};

const decodeBingUParam = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return normalized;

  const decodeBase64 = (raw: string) => {
    try {
      return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    } catch {
      return "";
    }
  };

  if (/^a1/i.test(normalized)) {
    const decoded = decodeBase64(normalized.slice(2));
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
  }

  const decoded = decodeBase64(normalized);
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
  return null;
};

const isLikelyCompanyHost = (url: string) => {
  const host = toHost(url);
  if (!host) return false;
  if (host.endsWith(".gov") || host.endsWith(".edu")) return false;
  return !EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint));
};

const titleToCompany = (title: string) => {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  const first = normalized.split(/\s+\|\s+|\s+-\s+|•|·/)[0] || normalized;
  const cleaned = normalizeText(first.replace(/\b(official website|home page|homepage)\b/gi, ""));
  return cleaned.length >= 2 ? cleaned : null;
};

const detectResultType = (input: SourceEngineInput) => {
  if (input.parsedQuery.intent === "buyers" || input.parsedQuery.intent === "importers") return "importer_signal";
  if (
    input.parsedQuery.intent === "suppliers" ||
    input.parsedQuery.intent === "manufacturers" ||
    input.parsedQuery.intent === "exporters"
  ) {
    return "exporter_signal";
  }
  return "company_profile";
};

const scoreCandidate = (payload: {
  query: string;
  title: string;
  snippet: string;
  url: string;
  parsedProduct: string | null;
  parsedCountry: string | null;
}) => {
  const text = `${payload.title} ${payload.snippet}`.toLowerCase();
  const queryTokens = payload.query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
  const tokenMatches = queryTokens.filter((token) => text.includes(token)).length;
  const tokenScore = queryTokens.length > 0 ? tokenMatches / queryTokens.length : 0.5;

  const host = toHost(payload.url);
  let score = 0.3 + tokenScore * 0.4;

  if (payload.parsedProduct && text.includes(payload.parsedProduct.toLowerCase())) score += 0.1;
  if (payload.parsedCountry && text.includes(payload.parsedCountry.toLowerCase())) score += 0.1;
  if (/\b(importer|supplier|manufacturer|distributor|wholesale|trading company)\b/.test(text)) score += 0.08;
  if (/\b(ltd|llc|inc|corp|company|group|trading|export|import)\b/.test(text)) score += 0.06;
  if (/\b(wiki|wikipedia|forum|reddit|quora|blog|news|health|dictionary|encyclopedia)\b/.test(text)) score -= 0.14;

  if (payload.parsedCountry) {
    const tlds = COUNTRY_TLDS[payload.parsedCountry.toLowerCase()] || [];
    if (tlds.some((tld) => host.endsWith(tld))) score += 0.08;
  }

  return Number(Math.max(0.05, Math.min(score, 0.99)).toFixed(2));
};

const resolveSearchResultUrl = async (href: string) => {
  const raw = normalizeText(href);
  if (!raw) return null;
  if (resolvedSearchUrlCache.has(raw)) {
    return resolvedSearchUrlCache.get(raw) || null;
  }

  let absolute = raw;
  try {
    absolute = raw.startsWith("http") ? raw : new URL(raw, "https://www.bing.com").toString();
  } catch {
    resolvedSearchUrlCache.set(raw, null);
    return null;
  }

  if (isLikelyCompanyHost(absolute)) {
    resolvedSearchUrlCache.set(raw, absolute);
    return absolute;
  }

  const parsedHost = toHost(absolute);
  if (!parsedHost.includes("bing.com")) {
    resolvedSearchUrlCache.set(raw, null);
    return null;
  }

  try {
    const parsed = new URL(absolute);
    const uParam = parsed.searchParams.get("u");
    if (uParam) {
      const decoded = decodeBingUParam(uParam);
      if (decoded && isLikelyCompanyHost(decoded)) {
        resolvedSearchUrlCache.set(raw, decoded);
        return decoded;
      }
    }
  } catch {
    // fallback to redirect-follow fetch
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(absolute, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": SEARCH_USER_AGENT,
        "accept-language": "en-US,en;q=0.8"
      },
      signal: controller.signal
    });
    const finalUrl = response.url || "";
    const resolved = isLikelyCompanyHost(finalUrl) ? finalUrl : null;
    resolvedSearchUrlCache.set(raw, resolved);
    return resolved;
  } catch {
    resolvedSearchUrlCache.set(raw, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const extractBingCandidates = (payload: {
  html: string;
  query: string;
  parsedProduct: string | null;
  parsedCountry: string | null;
}) => {
  const $ = load(payload.html);
  const candidates: SearchCandidate[] = [];

  $("li.b_algo").each((_, node) => {
    if (candidates.length >= 40) return;
    const anchor = $(node).find("h2 a").first();
    const href = normalizeText(anchor.attr("href"));
    const title = normalizeText(anchor.text());
    const snippet = normalizeText($(node).find(".b_caption p").first().text() || $(node).find("p").first().text());
    if (!href || !title) return;
    if (NON_COMPANY_TEXT_PATTERN.test(`${title} ${snippet}`)) return;
    candidates.push({
      title,
      snippet,
      url: href,
      score: 0,
      query: payload.query
    });
  });

  return candidates;
};

const extractBraveCandidates = (payload: {
  html: string;
  query: string;
  parsedProduct: string | null;
  parsedCountry: string | null;
}) => {
  const $ = load(payload.html);
  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();

  $("#results a[href^='http'], main a[href^='http']").each((_, node) => {
    if (candidates.length >= 60) return;

    const anchor = $(node);
    const href = normalizeText(anchor.attr("href"));
    if (!href) return;
    if (seen.has(href)) return;
    seen.add(href);

    const host = toHost(href);
    if (!host || host.includes("search.brave.com") || host.includes("imgs.search.brave.com")) return;
    if (!isLikelyCompanyHost(href)) return;

    const title = normalizeText(anchor.text() || anchor.attr("title") || "");
    if (title.length < 2) return;
    const snippet = normalizeText(anchor.closest("div").text() || "");
    if (NON_COMPANY_TEXT_PATTERN.test(`${title} ${snippet}`)) return;

    candidates.push({
      title,
      snippet,
      url: href,
      score: scoreCandidate({
        query: payload.query,
        title,
        snippet,
        url: href,
        parsedProduct: payload.parsedProduct,
        parsedCountry: payload.parsedCountry
      }),
      query: payload.query
    });
  });

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
};

const buildSearchUrls = (input: SourceEngineInput) => {
  const variants = buildCompanyFirstQueryVariants(input.parsedQuery);
  const queryList = variants.flatMap((query) => {
    const softFiltered = `${query} ${BING_SOFT_NEGATIVE_SITE_TOKENS.join(" ")}`.trim();
    return [query, softFiltered];
  });

  return Array.from(new Set(queryList))
    .map(
      (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-us&mkt=en-US&cc=us&ensearch=1`
    )
    .slice(0, 12);
};

const buildBraveSearchUrls = (input: SourceEngineInput) =>
  buildCompanyFirstQueryVariants(input.parsedQuery)
    .slice(0, 6)
    .map((query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`);

const contactCompletenessScore = (input: {
  website: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  contactPageUrl: string | null;
  whatsapp: string | null;
  telegram: string | null;
}) => {
  let score = 0;
  if (input.website) score += 0.2;
  if (input.contactPageUrl) score += 0.15;
  if (input.email) score += 0.25;
  if (input.phone) score += 0.25;
  if (input.contactName) score += 0.05;
  if (input.whatsapp) score += 0.05;
  if (input.telegram) score += 0.05;
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
};

const buildStatus = (payload: {
  blocked: boolean;
  warnings: string[];
  extractedResults: number;
  sawHtml: boolean;
}) => {
  if (payload.extractedResults > 0) {
    return { status: "ok" as const, parse_status: "success" as const };
  }
  if (payload.blocked) {
    return { status: "blocked" as const, parse_status: payload.sawHtml ? ("empty" as const) : ("failed" as const) };
  }
  if (payload.warnings.length > 0) {
    return { status: "error" as const, parse_status: payload.sawHtml ? ("empty" as const) : ("failed" as const) };
  }
  return { status: "ok" as const, parse_status: payload.sawHtml ? ("empty" as const) : ("failed" as const) };
};

export const runDirectWebsitesEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode || "fetch";
  const searchUrls = buildSearchUrls(input);
  const braveSearchUrls = buildBraveSearchUrls(input);
  const warnings: string[] = [];
  const fetchedUrls: string[] = [];
  const httpStatuses: number[] = [];
  let blocked = false;
  let antiBotDetected = false;
  let sawHtml = false;

  const candidatesByHost = new Map<string, SearchCandidate>();

  if (executionMode === "browser") {
    const browserResult = await runBrowserSourceEngine({
      sourceId: "direct_websites",
      sourceName: "Direct Company Websites",
      parsedQuery: input.parsedQuery,
      searchUrls,
      maxResults: Math.max(input.maxResults * 3, 18),
      resultTypeHint: detectResultType(input),
      includePathHints: [],
      excludePathHints: []
    });
    fetchedUrls.push(...browserResult.fetchedUrls);
    httpStatuses.push(...browserResult.http_statuses);
    warnings.push(...browserResult.warnings);
    blocked = browserResult.blocked;
    antiBotDetected = browserResult.anti_bot_detected;
    sawHtml = browserResult.parse_status !== "failed";

    for (const item of browserResult.results) {
      const resolved = await resolveSearchResultUrl(item.source_url);
      if (!resolved) continue;
      const host = toHost(resolved);
      if (!host || !isLikelyCompanyHost(resolved)) continue;
      const score = scoreCandidate({
        query: input.parsedQuery.query,
        title: item.company || item.description,
        snippet: item.description,
        url: resolved,
        parsedProduct: input.parsedQuery.product,
        parsedCountry: input.parsedQuery.target_country_or_region
      });
      if (!candidatesByHost.has(host)) {
        candidatesByHost.set(host, {
          title: item.company || item.description,
          snippet: item.description,
          url: resolved,
          score: Math.max(item.confidence_score, score),
          query: input.parsedQuery.query
        });
      }
    }
  } else {
    for (const searchUrl of searchUrls) {
      fetchedUrls.push(searchUrl);
      try {
        const { html, status } = await fetchPublicHtml(searchUrl);
        sawHtml = true;
        httpStatuses.push(status);

        const url = new URL(searchUrl);
        const query = url.searchParams.get("q") || input.parsedQuery.query;
        const candidates = extractBingCandidates({
          html,
          query,
          parsedProduct: input.parsedQuery.product,
          parsedCountry: input.parsedQuery.target_country_or_region
        });

        for (const candidate of candidates) {
          const resolved = await resolveSearchResultUrl(candidate.url);
          if (!resolved) continue;
          const host = toHost(resolved);
          if (!host) continue;
          const score = scoreCandidate({
            query: candidate.query,
            title: candidate.title,
            snippet: candidate.snippet,
            url: resolved,
            parsedProduct: input.parsedQuery.product,
            parsedCountry: input.parsedQuery.target_country_or_region
          });

          const current = candidatesByHost.get(host);
          if (!current || score > current.score) {
            candidatesByHost.set(host, {
              ...candidate,
              url: resolved,
              score
            });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to fetch search page";
        warnings.push(`${searchUrl}: ${message}`);
        if (/\b(blocked|challenge|captcha|anti-bot|403)\b/i.test(message)) {
          blocked = true;
          antiBotDetected = true;
        }
      }
    }

    const shouldTryBrave = candidatesByHost.size < Math.max(4, input.maxResults);
    if (shouldTryBrave) {
      const beforeBrave = candidatesByHost.size;
      for (const searchUrl of braveSearchUrls) {
        if (candidatesByHost.size >= Math.max(input.maxResults * 2, 12)) break;
        fetchedUrls.push(searchUrl);
        try {
          const { html, status } = await fetchPublicHtml(searchUrl);
          sawHtml = true;
          httpStatuses.push(status);

          const url = new URL(searchUrl);
          const query = url.searchParams.get("q") || input.parsedQuery.query;
          const candidates = extractBraveCandidates({
            html,
            query,
            parsedProduct: input.parsedQuery.product,
            parsedCountry: input.parsedQuery.target_country_or_region
          });

          for (const candidate of candidates) {
            const host = toHost(candidate.url);
            if (!host) continue;
            const current = candidatesByHost.get(host);
            if (!current || candidate.score > current.score) {
              candidatesByHost.set(host, candidate);
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "failed to fetch Brave search page";
          warnings.push(`${searchUrl}: ${message}`);
        }
      }
      const braveAdded = Math.max(0, candidatesByHost.size - beforeBrave);
      warnings.push(`Company-first fallback: Brave source-native search added ${braveAdded} candidate host(s).`);
    }
  }

  const shortlisted = Array.from(candidatesByHost.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(input.maxResults * 2, 12));

  const resultType = detectResultType(input);
  const enriched: NormalizedMarketResult[] = [];

  for (const candidate of shortlisted) {
    if (enriched.length >= input.maxResults) break;
    const company = titleToCompany(candidate.title);
    const canonicalUrl = toRootUrl(candidate.url);
    const provisional = withOriginMeta(
      {
        id: createHash("sha1").update(`direct_websites|${canonicalUrl}`).digest("hex").slice(0, 16),
        product: input.parsedQuery.product,
        company,
        contact_name: null,
        country: input.parsedQuery.target_country_or_region || null,
        quantity: null,
        incoterms: null,
        payment_terms: null,
        description: truncate(candidate.snippet || candidate.title, 900),
        source_name: "Direct Company Websites",
        source_url: canonicalUrl,
        raw_text: truncate(
          [
            `Discovery query: ${candidate.query}`,
            `Title: ${candidate.title}`,
            `Snippet: ${candidate.snippet}`,
            `Candidate URL: ${candidate.url}`
          ]
            .filter(Boolean)
            .join("\n"),
          15000
        ),
        result_type: resultType,
        confidence_score: candidate.score,
        shipping_terms: null,
        destination: input.parsedQuery.destination_country || null,
        posted_date: null,
        acquisition_origin: executionMode === "browser" ? "browser_fallback" : "company_website"
      },
      executionMode
    );

    try {
      const enrichment = await enrichCompanyFromMarketResult(provisional, {
        preferDirectWebsite: true,
        companyCountry: input.parsedQuery.target_country_or_region || null,
        productHint: input.parsedQuery.product || null
      });
      const contactScore = contactCompletenessScore({
        website: enrichment.website,
        email: enrichment.email,
        phone: enrichment.phone,
        contactName: enrichment.contactName,
        contactPageUrl: enrichment.contactPageUrl,
        whatsapp: enrichment.whatsapp,
        telegram: enrichment.telegram
      });

      const confidence = Number(
        Math.max(
          provisional.confidence_score,
          Math.min(
            0.99,
            provisional.confidence_score * 0.72 +
              contactScore * 0.28 +
              (enrichment.websiteResolvedBySearch ? 0.08 : 0) +
              (enrichment.websiteCrawled ? 0.06 : 0)
          )
        ).toFixed(2)
      );

      const contactsFromText = parseFields(candidate.snippet);
      const website = normalizeText(enrichment.website || canonicalUrl);
      const mergedCompany = normalizeText(enrichment.companyName || company || "");
      const mergedCountry = normalizeText(enrichment.country || input.parsedQuery.target_country_or_region || "");
      const mergedContact = normalizeText(enrichment.contactName || contactsFromText.contact || "");
      const looksNonCompany = NON_COMPANY_TEXT_PATTERN.test(`${mergedCompany} ${candidate.title} ${candidate.snippet}`);
      if (looksNonCompany && contactScore < 0.4) continue;

      const finalResult = withOriginMeta(
        {
          ...provisional,
          source_url: website || provisional.source_url,
          company: mergedCompany || provisional.company,
          country: mergedCountry || provisional.country,
          contact_name: mergedContact || provisional.contact_name,
          description: truncate(
            [
              mergedCompany || provisional.company || "Company",
              mergedCountry ? `(${mergedCountry})` : "",
              provisional.product ? `• ${provisional.product}` : "",
              enrichment.email ? `• ${enrichment.email}` : "",
              enrichment.phone ? `• ${enrichment.phone}` : ""
            ]
              .filter(Boolean)
              .join(" "),
            900
          ),
          raw_text: truncate(
            [
              provisional.raw_text,
              website ? `Website: ${website}` : "",
              enrichment.contactPageUrl ? `Contact page: ${enrichment.contactPageUrl}` : "",
              enrichment.email ? `Email: ${enrichment.email}` : "",
              enrichment.phone ? `Phone: ${enrichment.phone}` : "",
              enrichment.contactName ? `Contact: ${enrichment.contactName}` : "",
              enrichment.whatsapp ? `WhatsApp: ${enrichment.whatsapp}` : "",
              enrichment.telegram ? `Telegram: ${enrichment.telegram}` : "",
              `Contact completeness: ${contactScore}`
            ]
              .filter(Boolean)
              .join("\n"),
            17000
          ),
          confidence_score: confidence,
          contact_completeness_score: contactScore,
          acquisition_origin: enrichment.websiteCrawled || enrichment.websiteResolvedBySearch ? "company_website" : provisional.acquisition_origin
        },
        executionMode
      );

      enriched.push(finalResult);
    } catch (error) {
      warnings.push(`${canonicalUrl}: enrichment failed (${error instanceof Error ? error.message : "unknown"})`);
      enriched.push(provisional);
    }
  }

  const deduped = Array.from(
    enriched.reduce((acc, item) => {
      const host = toHost(item.source_url) || item.source_url.toLowerCase();
      const existing = acc.get(host);
      if (!existing || item.confidence_score > existing.confidence_score) acc.set(host, item);
      return acc;
    }, new Map<string, NormalizedMarketResult>())
      .values()
  )
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, input.maxResults);

  if (deduped.length === 0) {
    warnings.push("Direct company discovery returned no usable company websites.");
  } else {
    const rewriteInfo = buildCompanyFirstQueryVariants(input.parsedQuery).slice(0, 3).join(" | ");
    warnings.push(`Company-first search rewrites: ${rewriteInfo}`);
  }

  const statusMeta = buildStatus({
    blocked,
    warnings,
    extractedResults: deduped.length,
    sawHtml
  });

  return {
    sourceId: "direct_websites",
    sourceName: "Direct Company Websites",
    execution_mode: executionMode,
    fetchedUrls,
    warnings,
    http_statuses: httpStatuses,
    response_status: httpStatuses[0] ?? null,
    blocked,
    anti_bot_detected: antiBotDetected,
    parse_status: statusMeta.parse_status,
    status: statusMeta.status,
    extracted_results: deduped.length,
    results: deduped
  };
};
