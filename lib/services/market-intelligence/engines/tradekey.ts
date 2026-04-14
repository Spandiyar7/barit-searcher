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
    input.parsedQuery.buyer_country ||
    input.parsedQuery.supplier_country ||
    "";

  const urls = [
    `https://www.tradekey.com/${slug}.html`,
    `https://www.tradekey.com/search/?q=${encoded}`,
    `https://www.tradekey.com/buyoffer_search/?search_text=${encoded}`,
    `https://www.tradekey.com/selloffer_search/?search_text=${encoded}`
  ];

  if (country) {
    urls.push(`https://www.tradekey.com/search/?q=${encoded}&country=${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runTradeKeyEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "tradekey" as const,
    sourceName: "TradeKey",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["buyer", "supplier", "buyoffer", "selloffer", "rfq", "offer", "product"],
    excludePathHints: ["forum", "blog", "news"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};
