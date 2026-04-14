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

  const modePath =
    input.parsedQuery.intent === "suppliers" ||
    input.parsedQuery.intent === "manufacturers" ||
    input.parsedQuery.intent === "exporters"
      ? "suppliers"
      : "buyers";

  const urls = [
    `https://www.tradewheel.com/${modePath}/${slug}.html`,
    `https://www.tradewheel.com/search/?keyword=${encoded}`,
    `https://www.tradewheel.com/search-products/?keyword=${encoded}`,
    `https://www.tradewheel.com/search-buyers/?keyword=${encoded}`
  ];

  if (country) {
    urls.push(`https://www.tradewheel.com/search/?keyword=${encoded}&country=${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runTradeWheelEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "tradewheel" as const,
    sourceName: "TradeWheel",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["buyer", "supplier", "rfq", "sell", "offer", "import", "export", "product"],
    excludePathHints: ["blog", "news"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};
