import { createHash } from "node:crypto";
import {
  enrichCompanyFromMarketResult,
  resolveCompanyWebsiteForCompanyName
} from "@/lib/services/company-enrichment";
import { buildCompanyFirstQueryVariants } from "@/lib/services/market-intelligence/company-discovery";
import type { NormalizedMarketResult, SourceEngineInput, SourceEngineResult } from "../types";
import { withOriginMeta } from "../source-origin";
import { normalizeText, truncate } from "./shared";

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

const NON_COMPANY_TEXT_PATTERN =
  /\b(wikipedia|market report|by country|what is|definition|dictionary|forum|reddit|quora|news|video|youtube|health|medical)\b/i;

const COMPANY_SUFFIX_PATTERN =
  /\b([a-z0-9][a-z0-9&.,'\- ]{1,90}\s(?:llc|ltd|limited|inc|corp|co\.?|company|group|gmbh|sarl|fze|dmcc|pte|ag|bv|srl))\b/gi;

const QUOTED_COMPANY_PATTERN = /["“”]([^"“”]{3,120})["“”]/g;
const NON_ERROR_DIAGNOSTICS = new Set([
  "registry_first",
  "company_name_required",
  "web_search_fallback_skipped",
  "web_search_provider_blocked"
]);

type WebsiteCandidate = {
  website: string;
  company: string | null;
  source: "custom_source" | "query_company";
};

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

const normalizeWebsiteInput = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return toRootUrl(parsed.toString());
  } catch {
    return null;
  }
};

const isLikelyCompanyHost = (url: string) => {
  const host = toHost(url);
  if (!host) return false;
  if (host.endsWith(".gov") || host.endsWith(".edu")) return false;
  return !EXCLUDED_HOST_HINTS.some((hint) => host.includes(hint));
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

const inferCompanyFromHost = (url: string) => {
  const host = toHost(url);
  if (!host) return null;
  const base = host.split(".")[0] || "";
  const human = normalizeText(base.replace(/[-_]+/g, " "));
  return human.length >= 2 ? human : null;
};

const extractCompanyNamesFromQuery = (query: string) => {
  const text = normalizeText(query);
  if (!text) return [];

  const items = new Set<string>();

  const quotedMatches = text.matchAll(QUOTED_COMPANY_PATTERN);
  for (const match of quotedMatches) {
    const name = normalizeText(match[1]);
    if (name.length >= 3 && !NON_COMPANY_TEXT_PATTERN.test(name)) {
      items.add(name);
    }
  }

  const suffixMatches = text.matchAll(COMPANY_SUFFIX_PATTERN);
  for (const match of suffixMatches) {
    const name = normalizeText(match[1]);
    if (name.length >= 3 && !NON_COMPANY_TEXT_PATTERN.test(name)) {
      items.add(name);
    }
  }

  return Array.from(items).slice(0, 10);
};

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
  sawSignals: boolean;
}) => {
  const diagnosticsOnly =
    payload.warnings.length > 0 && payload.warnings.every((item) => NON_ERROR_DIAGNOSTICS.has(item));

  if (payload.extractedResults > 0) {
    return { status: "ok" as const, parse_status: "success" as const };
  }
  if (payload.blocked) {
    return { status: "blocked" as const, parse_status: payload.sawSignals ? ("empty" as const) : ("failed" as const) };
  }
  if (diagnosticsOnly) {
    return { status: "ok" as const, parse_status: payload.sawSignals ? ("empty" as const) : ("skipped" as const) };
  }
  if (payload.warnings.length > 0) {
    return { status: "error" as const, parse_status: payload.sawSignals ? ("empty" as const) : ("failed" as const) };
  }
  return { status: "ok" as const, parse_status: payload.sawSignals ? ("empty" as const) : ("failed" as const) };
};

const confidenceFromSignals = (payload: {
  base: number;
  website: string;
  company: string | null;
  country: string | null;
  product: string | null;
  contactScore: number;
  websiteResolvedBySearch: boolean;
  websiteCrawled: boolean;
}) => {
  let score = payload.base;
  score += payload.contactScore * 0.3;
  if (payload.websiteResolvedBySearch) score += 0.08;
  if (payload.websiteCrawled) score += 0.06;

  const host = toHost(payload.website);
  if (payload.country) {
    const tlds = COUNTRY_TLDS[payload.country.toLowerCase()] || [];
    if (tlds.some((tld) => host.endsWith(tld))) {
      score += 0.04;
    }
  }

  if (payload.company && payload.company.length >= 2) score += 0.03;
  if (payload.product) score += 0.02;

  return Number(Math.max(0.1, Math.min(0.99, score)).toFixed(2));
};

export const runDirectWebsitesEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode || "fetch";
  const warningsSet = new Set<string>();
  const fetchedUrls: string[] = [];
  const httpStatuses: number[] = [];
  let blocked = false;
  let antiBotDetected = false;
  let sawSignals = false;

  const knownCompanyNames = extractCompanyNamesFromQuery(input.parsedQuery.query);
  const knownWebsites = (input.parsedQuery.custom_sources || [])
    .map((item) => normalizeWebsiteInput(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => isLikelyCompanyHost(item));

  const candidatesByHost = new Map<string, WebsiteCandidate>();

  const addCandidate = (candidate: WebsiteCandidate) => {
    const host = toHost(candidate.website);
    if (!host || !isLikelyCompanyHost(candidate.website)) return;
    if (!candidatesByHost.has(host)) {
      candidatesByHost.set(host, {
        website: toRootUrl(candidate.website),
        company: candidate.company,
        source: candidate.source
      });
    }
  };

  knownWebsites.forEach((website) => {
    addCandidate({
      website,
      company: inferCompanyFromHost(website),
      source: "custom_source"
    });
  });

  if (knownCompanyNames.length === 0) {
    warningsSet.add("registry_first");
  }

  for (const companyName of knownCompanyNames) {
    const resolution = await resolveCompanyWebsiteForCompanyName({
      companyName,
      country: input.parsedQuery.target_country_or_region || input.parsedQuery.buyer_country || null,
      productHint: input.parsedQuery.product || null
    });

    if (resolution.url) {
      sawSignals = true;
      fetchedUrls.push(resolution.url);
      addCandidate({
        website: resolution.url,
        company: companyName,
        source: "query_company"
      });
      continue;
    }

    if (resolution.status === "provider_missing") {
      warningsSet.add("web_search_fallback_skipped");
    } else if (resolution.status === "provider_blocked") {
      warningsSet.add("web_search_provider_blocked");
      blocked = true;
      antiBotDetected = true;
    }
  }

  if (knownCompanyNames.length === 0 && knownWebsites.length === 0) {
    warningsSet.add("company_name_required");
    if (!process.env.BRAVE_SEARCH_API_KEY) {
      warningsSet.add("web_search_fallback_skipped");
    }

    const warnings = Array.from(warningsSet);
    const statusMeta = buildStatus({
      blocked,
      warnings,
      extractedResults: 0,
      sawSignals
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
      extracted_results: 0,
      results: []
    };
  }

  const shortlisted = Array.from(candidatesByHost.values()).slice(0, Math.max(input.maxResults * 2, 12));
  const resultType = detectResultType(input);
  const enriched: NormalizedMarketResult[] = [];

  for (const candidate of shortlisted) {
    if (enriched.length >= input.maxResults) break;

    const canonicalUrl = toRootUrl(candidate.website);
    const provisionalCompany = normalizeText(candidate.company || inferCompanyFromHost(canonicalUrl) || "") || null;

    const provisional = withOriginMeta(
      {
        id: createHash("sha1").update(`direct_websites|${canonicalUrl}|${provisionalCompany || "company"}`).digest("hex").slice(0, 16),
        product: input.parsedQuery.product,
        company: provisionalCompany,
        contact_name: null,
        country: input.parsedQuery.target_country_or_region || null,
        quantity: null,
        incoterms: null,
        payment_terms: null,
        description: truncate(`${provisionalCompany || "Company"} • ${canonicalUrl}`, 900),
        source_name: "Direct Company Websites",
        source_url: canonicalUrl,
        raw_text: truncate(
          [
            `Discovery mode: registry_first`,
            `Candidate source: ${candidate.source}`,
            `Company: ${provisionalCompany || "unknown"}`,
            `Website: ${canonicalUrl}`,
            `Query: ${input.parsedQuery.query}`,
            `Rewrites: ${buildCompanyFirstQueryVariants(input.parsedQuery).slice(0, 4).join(" | ")}`
          ]
            .filter(Boolean)
            .join("\n"),
          16000
        ),
        result_type: resultType,
        confidence_score: candidate.source === "query_company" ? 0.58 : 0.52,
        shipping_terms: null,
        destination: input.parsedQuery.destination_country || null,
        posted_date: null,
        acquisition_origin: "company_website"
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

      const website = normalizeText(enrichment.website || canonicalUrl);
      const company = normalizeText(enrichment.companyName || provisional.company || "") || provisional.company;
      const country = normalizeText(enrichment.country || input.parsedQuery.target_country_or_region || "") || provisional.country;
      const looksNonCompany = NON_COMPANY_TEXT_PATTERN.test(`${company || ""} ${canonicalUrl}`);
      if (looksNonCompany && contactScore < 0.35) continue;

      const confidence = confidenceFromSignals({
        base: provisional.confidence_score,
        website,
        company,
        country,
        product: provisional.product,
        contactScore,
        websiteResolvedBySearch: enrichment.websiteResolvedBySearch,
        websiteCrawled: enrichment.websiteCrawled
      });

      const finalResult = withOriginMeta(
        {
          ...provisional,
          source_url: website || provisional.source_url,
          company,
          country,
          contact_name: normalizeText(enrichment.contactName || "") || provisional.contact_name,
          description: truncate(
            [
              company || "Company",
              country ? `(${country})` : "",
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
          acquisition_origin: "company_website"
        },
        executionMode
      );

      enriched.push(finalResult);
    } catch (error) {
      warningsSet.add(`enrichment_failed:${error instanceof Error ? error.message : "unknown"}`);
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

  if (input.parsedQuery.product_category === "food_agriculture") {
    warningsSet.add("registry_first");
  }

  if (deduped.length === 0 && !warningsSet.has("company_name_required")) {
    warningsSet.add("registry_first");
  }

  const warnings = Array.from(warningsSet);
  const statusMeta = buildStatus({
    blocked,
    warnings,
    extractedResults: deduped.length,
    sawSignals: sawSignals || shortlisted.length > 0
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
