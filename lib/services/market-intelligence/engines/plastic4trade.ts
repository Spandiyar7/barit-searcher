import type { SourceEngineInput, SourceEngineResult } from "../types";
import { runBrowserSourceEngine, runGenericSourceEngine, slugify } from "./shared";

const getResultType = (intent: SourceEngineInput["parsedQuery"]["intent"]) => {
  if (intent === "buyers" || intent === "importers" || intent === "rfq") return "buyer_rfq";
  if (intent === "suppliers" || intent === "manufacturers" || intent === "exporters") return "supplier_offer";
  return "market_listing";
};

const buildSearchUrls = (input: SourceEngineInput) => {
  const keyword = input.parsedQuery.product || input.parsedQuery.query;
  const encoded = encodeURIComponent(keyword);
  const slug = slugify(keyword);
  const country =
    input.parsedQuery.target_country_or_region ||
    input.parsedQuery.supplier_country ||
    input.parsedQuery.buyer_country ||
    "";

  const intentPath =
    input.parsedQuery.intent === "suppliers" ||
    input.parsedQuery.intent === "manufacturers" ||
    input.parsedQuery.intent === "exporters"
      ? "sell-offers"
      : "buy-offers";

  const urls = [
    `https://plastic4trade.com/?s=${encoded}`,
    `https://plastic4trade.com/search/${slug}/`,
    `https://plastic4trade.com/${intentPath}/${slug}/`,
    `https://plastic4trade.com/category/${slug}/`,
    `https://plastic4trade.com/tag/${slug}/`
  ];

  if (country) {
    urls.push(`https://plastic4trade.com/?s=${encoded}+${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runPlastic4TradeEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "plastic4trade" as const,
    sourceName: "Plastic4Trade",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["buy-offer", "sell-offer", "buyer", "supplier", "offer", "product", "category", "tag"],
    excludePathHints: ["login", "register", "privacy", "policy", "terms", "help", "blog"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};

