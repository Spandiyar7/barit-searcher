import { createHash } from "node:crypto";
import { load } from "cheerio";
import { withOriginMeta } from "./source-origin";
import type {
  NormalizedMarketResult,
  ParsedQuery,
  SourceEngineResult,
  SourceId
} from "./types";
import { normalizeText, parseFields, parseIncoterms, truncate } from "./engines/shared";

const SEARCH_TIMEOUT_MS = 12_000;
const SEARCH_USER_AGENT = "Mozilla/5.0 (compatible; CommodityTradingCRM/1.0; +https://example.com/contact)";

type SearchCandidate = {
  title: string;
  snippet: string;
  url: string;
};

type SearchProviderResult = {
  provider: "brave" | "bing";
  queryUrl: string;
  candidates: SearchCandidate[];
  httpStatus?: number | null;
};

const SOURCE_DOMAINS: Partial<Record<SourceId, string[]>> = {
  petrochemz: ["petrochemz.com"],
  global_trade_plaza: ["globaltradeplaza.com"],
  plastic4trade: ["plastic4trade.com"],
  globy: ["globy.com"],
  chemnet: ["chemnet.com"],
  toocle: ["toocle.com"],
  go4worldbusiness: ["go4worldbusiness.com"],
  tradewheel: ["tradewheel.com"],
  tradekey: ["tradekey.com"],
  eworldtrade: ["eworldtrade.com"],
  ec21: ["ec21.com"],
  exporthub: ["exporthub.com"],
  alibaba: ["alibaba.com", "sourcing.alibaba.com"],
  made_in_china: ["made-in-china.com"],
  global_sources: ["globalsources.com"],
  indiamart: ["indiamart.com"],
  turkishexporter: ["turkishexporter.net"],
  europages: ["europages.com"],
  kompass: ["kompass.com"],
  thomasnet: ["thomasnet.com"],
  globalspec: ["globalspec.com"],
  volza: ["volza.com"],
  panjiva: ["panjiva.com"],
  importgenius: ["importgenius.com"],
  seair: ["seair.co.in", "seair.com"],
  trademo: ["trademo.com"],
  argus_media: ["argusmedia.com"],
  spglobal_platts: ["spglobal.com", "spglobal.com/platts"],
  asianmetal: ["asianmetal.com"],
  metal_com: ["metal.com"],
  satu_kz: ["satu.kz"],
  avito: ["avito.ru", "avito.kz", "avito.com"],
  all_biz: ["all.biz"],
  tiuru: ["tiu.ru"],
  optlist: ["optlist.ru", "optlist.com"],
  agroserver: ["agroserver.ru", "agroserver.kz"],
  flagma: ["flagma.com"],
  agro_kg: ["agro.kg"],
  tajagro: ["tajagro.tj", "tajagro.com"],
  gieldarolna: ["gieldarolna.pl"],
  gratka: ["gratka.pl"]
};

const resultTypeByIntent = (parsedQuery: ParsedQuery) => {
  if (parsedQuery.recurring_buyer_intent) return "recurring_buyer_signal";
  if (parsedQuery.intent === "buyers" || parsedQuery.intent === "importers") return "importer_signal";
  if (parsedQuery.intent === "suppliers" || parsedQuery.intent === "manufacturers" || parsedQuery.intent === "exporters") {
    return "exporter_signal";
  }
  if (parsedQuery.intent === "rfq") return "buyer_rfq";
  return "market_listing";
};

const intentPhraseByIntent = (parsedQuery: ParsedQuery) => {
  if (parsedQuery.recurring_buyer_intent) return "recurring importer buyer company";
  if (parsedQuery.intent === "buyers" || parsedQuery.intent === "importers") return "importer buyer company";
  if (parsedQuery.intent === "suppliers" || parsedQuery.intent === "manufacturers" || parsedQuery.intent === "exporters") {
    return "exporter supplier manufacturer company";
  }
  if (parsedQuery.intent === "rfq") return "buyer requirement rfq";
  return "trade company listing";
};

const isAllowedHost = (url: string, domains: string[]) => {
  if (domains.length === 0) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

const toHost = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return normalized.toLowerCase().replace(/^www\./, "").replace(/^https?:\/\//, "").split("/")[0];
  }
};

const fallbackConfidence = (payload: { parsedQuery: ParsedQuery; title: string; snippet: string; url: string; domains: string[] }) => {
  const text = `${payload.title} ${payload.snippet}`.toLowerCase();
  const tokenMatches = payload.parsedQuery.tokens.filter((token) => token.length > 1 && text.includes(token.toLowerCase())).length;
  const tokenScore = payload.parsedQuery.tokens.length > 0 ? tokenMatches / payload.parsedQuery.tokens.length : 0.45;

  let score = 0.38 + tokenScore * 0.32;

  if (payload.parsedQuery.product && text.includes(payload.parsedQuery.product.toLowerCase())) score += 0.1;
  if (
    payload.parsedQuery.target_country_or_region &&
    text.includes(payload.parsedQuery.target_country_or_region.toLowerCase())
  ) {
    score += 0.1;
  }

  if (isAllowedHost(payload.url, payload.domains)) score += 0.08;

  return Number(Math.max(0.25, Math.min(0.86, score)).toFixed(2));
};

const buildQueries = (parsedQuery: ParsedQuery, domains: string[]) => {
  const keyword = parsedQuery.product || parsedQuery.query;
  const country = parsedQuery.target_country_or_region || parsedQuery.buyer_country || parsedQuery.supplier_country || "";
  const intentPhrase = intentPhraseByIntent(parsedQuery);
  const domain = domains[0];
  const queryBase = [keyword, country].filter(Boolean).join(" ").trim();
  const queries: string[] = [];

  if (domain) {
    queries.push([queryBase, intentPhrase, `site:${domain}`].filter(Boolean).join(" ").trim());
    queries.push([queryBase, `site:${domain}`].filter(Boolean).join(" ").trim());
    queries.push([keyword, intentPhrase, `site:${domain}`].filter(Boolean).join(" ").trim());
  }

  queries.push([queryBase, intentPhrase].filter(Boolean).join(" ").trim());
  queries.push(keyword);

  return Array.from(new Set(queries.filter(Boolean))).slice(0, 4);
};

const fetchWithTimeout = async (url: string, headers: Record<string, string>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
};

const searchWithBrave = async (query: string): Promise<SearchProviderResult> => {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not configured");

  const queryUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20`;
  const response = await fetchWithTimeout(queryUrl, {
    "x-subscription-token": apiKey,
    accept: "application/json",
    "accept-language": "en-US,en;q=0.8",
    "user-agent": SEARCH_USER_AGENT
  });

  if (!response.ok) {
    throw new Error(`Brave search returned ${response.status}`);
  }

  const json = (await response.json()) as {
    web?: {
      results?: Array<{
        title?: string;
        url?: string;
        description?: string;
      }>;
    };
  };

  const candidates = (json.web?.results || [])
    .map((item) => ({
      title: normalizeText(item.title || ""),
      snippet: normalizeText(item.description || ""),
      url: normalizeText(item.url || "")
    }))
    .filter((item) => item.url && item.title);

  return {
    provider: "brave",
    queryUrl,
    candidates,
    httpStatus: response.status
  };
};

const searchWithBing = async (query: string): Promise<SearchProviderResult> => {
  const queryUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(queryUrl, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.8",
    "user-agent": SEARCH_USER_AGENT
  });

  if (!response.ok) {
    throw new Error(`Bing returned ${response.status}`);
  }

  const html = await response.text();
  const $ = load(html);
  const candidates: SearchCandidate[] = [];

  $("li.b_algo").each((_, node) => {
    if (candidates.length >= 30) return;

    const anchor = $(node).find("h2 a").first();
    const href = normalizeText(anchor.attr("href"));
    const title = normalizeText(anchor.text());
    const snippet = normalizeText($(node).find(".b_caption p").first().text() || $(node).find("p").first().text());
    if (!href || !title) return;
    if (!href.startsWith("http")) return;

    candidates.push({
      title,
      snippet,
      url: href
    });
  });

  return {
    provider: "bing",
    queryUrl,
    candidates,
    httpStatus: response.status
  };
};

const buildResultId = (sourceName: string, sourceUrl: string, title: string) =>
  createHash("sha1").update(`${sourceName}|fallback|${sourceUrl}|${title}`).digest("hex").slice(0, 16);

const toNormalizedFallbackResults = (input: {
  sourceName: string;
  parsedQuery: ParsedQuery;
  domains: string[];
  maxResults: number;
  provider: SearchProviderResult["provider"];
  candidates: SearchCandidate[];
}): NormalizedMarketResult[] => {
  const map = new Map<string, NormalizedMarketResult>();

  input.candidates.forEach((candidate) => {
    if (!isAllowedHost(candidate.url, input.domains)) return;
    if (map.size >= input.maxResults) return;

    const title = normalizeText(candidate.title);
    const snippet = normalizeText(candidate.snippet || candidate.title);
    const fields = parseFields(`${title}\n${snippet}`);

    const normalized = withOriginMeta(
      {
        id: buildResultId(input.sourceName, candidate.url, title),
        product: input.parsedQuery.product,
        company: fields.company,
        contact_name: fields.contact,
        country: fields.country,
        quantity: fields.quantity,
        incoterms: parseIncoterms(`${fields.shippingTerms || ""} ${snippet}`),
        payment_terms: fields.paymentTerms,
        description: truncate(`${title}. ${snippet}`, 1000),
        source_name: input.sourceName,
        source_url: candidate.url,
        raw_text: truncate(`Automated fallback index (${input.provider})\n${title}\n${snippet}`, 16000),
        result_type: resultTypeByIntent(input.parsedQuery),
        confidence_score: fallbackConfidence({
          parsedQuery: input.parsedQuery,
          title,
          snippet,
          url: candidate.url,
          domains: input.domains
        }),
        shipping_terms: fields.shippingTerms,
        destination: fields.destination,
        posted_date: fields.postedDate,
        source_kind: "fallback",
        import_mode: "generated"
      },
      "generated"
    );

    map.set(candidate.url.toLowerCase(), normalized);
  });

  return Array.from(map.values()).slice(0, input.maxResults);
};

const runSearchProvider = async (query: string): Promise<SearchProviderResult> => {
  const preferred = (process.env.MARKET_FALLBACK_SEARCH_PROVIDER || "auto").toLowerCase();

  if (preferred === "brave") {
    try {
      return await searchWithBrave(query);
    } catch {
      return searchWithBing(query);
    }
  }

  if (preferred === "bing") {
    return searchWithBing(query);
  }

  if (process.env.BRAVE_SEARCH_API_KEY) {
    try {
      return await searchWithBrave(query);
    } catch {
      return searchWithBing(query);
    }
  }

  return searchWithBing(query);
};

export const runAutomatedSourceIndexFallback = async (input: {
  sourceId: SourceId;
  sourceName: string;
  parsedQuery: ParsedQuery;
  maxResults: number;
}): Promise<SourceEngineResult | null> => {
  const catalogDomains = SOURCE_DOMAINS[input.sourceId] || [];
  const customDomains = (input.parsedQuery.custom_sources || []).map(toHost).filter(Boolean);
  const domains = catalogDomains.length > 0 ? catalogDomains : customDomains;
  if (domains.length === 0) return null;

  const queries = buildQueries(input.parsedQuery, domains);
  const warnings: string[] = [];
  const fetchedUrls: string[] = [];
  const httpStatuses: number[] = [];
  const aggregated = new Map<string, NormalizedMarketResult>();
  let lastResponseStatus: number | null = null;
  let parseStatus: "success" | "empty" | "failed" = "empty";
  let blocked = false;

  for (const query of queries) {
    if (aggregated.size >= input.maxResults) break;

    try {
      const providerResult = await runSearchProvider(query);
      if (providerResult.queryUrl) fetchedUrls.push(providerResult.queryUrl);
      if (typeof providerResult.httpStatus === "number") {
        httpStatuses.push(providerResult.httpStatus);
        lastResponseStatus = providerResult.httpStatus;
      }

      const remaining = Math.max(1, input.maxResults - aggregated.size);
      const results = toNormalizedFallbackResults({
        sourceName: input.sourceName,
        parsedQuery: input.parsedQuery,
        domains,
        maxResults: remaining,
        provider: providerResult.provider,
        candidates: providerResult.candidates
      });

      results.forEach((item) => {
        if (aggregated.size >= input.maxResults) return;
        const key = item.source_url.toLowerCase();
        if (!aggregated.has(key)) aggregated.set(key, item);
      });

      if (results.length > 0) {
        parseStatus = "success";
        warnings.push(
          `Automated fallback (${providerResult.provider}) query matched ${results.length} indexed pages for ${input.sourceName}.`
        );
      }
    } catch (error) {
      parseStatus = parseStatus === "success" ? "success" : "failed";
      const message = error instanceof Error ? error.message : "unknown error";
      if (/\b(403|429|blocked|challenge|captcha|anti-bot)\b/i.test(message)) {
        blocked = true;
      }
      warnings.push(
        `Automated fallback query failed for ${input.sourceName}: ${message}`
      );
    }
  }

  const results = Array.from(aggregated.values()).slice(0, input.maxResults);

  if (results.length === 0 && parseStatus !== "failed") {
    warnings.push(`Automated fallback found no matching indexed results for ${input.sourceName}.`);
  }

  return {
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    execution_mode: "fetch",
    fetchedUrls: [...fetchedUrls, ...results.map((item) => item.source_url).slice(0, 5)],
    warnings,
    http_statuses: httpStatuses,
    response_status: lastResponseStatus,
    blocked,
    anti_bot_detected: blocked,
    parse_status: results.length > 0 ? "success" : parseStatus,
    status: results.length > 0 ? "ok" : "error",
    extracted_results: results.length,
    results
  };
};
