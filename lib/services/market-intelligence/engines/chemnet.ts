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
    `https://www.chemnet.com/search/?q=${encoded}`,
    `https://www.chemnet.com/search?keyword=${encoded}`,
    `https://www.chemnet.com/search.cgi?terms=${encoded}`,
    `https://www.chemnet.com/products/${slug}.html`,
    `https://www.chemnet.com/supplier/${slug}.html`,
    `https://www.chemnet.com/buyer/${slug}.html`
  ];

  if (country) {
    urls.push(`https://www.chemnet.com/search/?q=${encoded}&country=${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runChemNetEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "chemnet" as const,
    sourceName: "ChemNet",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["product", "products", "supplier", "suppliers", "buyer", "buyers", "offer", "listing", "trade"],
    excludePathHints: ["login", "register", "privacy", "policy", "terms", "help"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};

