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

  const urls = [
    `https://www.toocle.com/search?wd=${encoded}`,
    `https://www.toocle.com/search?keyword=${encoded}`,
    `https://www.toocle.com/products/${slug}`,
    `https://www.toocle.com/suppliers/${slug}`,
    `https://www.toocle.com/buyers/${slug}`
  ];

  if (country) {
    urls.push(`https://www.toocle.com/search?wd=${encoded}+${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runToocleEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "toocle" as const,
    sourceName: "Toocle",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["supplier", "suppliers", "buyer", "buyers", "product", "products", "offer", "trade"],
    excludePathHints: ["login", "register", "privacy", "policy", "terms", "help", "news"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};

