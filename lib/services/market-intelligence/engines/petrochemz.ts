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
      ? "suppliers"
      : "buyers";

  const urls = [
    `https://petrochemz.com/?s=${encoded}`,
    `https://petrochemz.com/search/${slug}/`,
    `https://petrochemz.com/${intentPath}/${slug}/`,
    `https://petrochemz.com/category/${slug}/`,
    `https://petrochemz.com/tag/${slug}/`
  ];

  if (country) {
    urls.push(`https://petrochemz.com/?s=${encoded}+${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runPetroChemzEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "petrochemz" as const,
    sourceName: "PetroChemz",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["buyer", "buyers", "supplier", "suppliers", "offer", "offers", "product", "category", "tag"],
    excludePathHints: ["login", "register", "policy", "privacy", "terms", "account"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};

