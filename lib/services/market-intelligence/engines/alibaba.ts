import type { SourceEngineInput, SourceEngineResult } from "../types";
import { runBrowserSourceEngine, runGenericSourceEngine, slugify } from "./shared";

const getResultType = (intent: SourceEngineInput["parsedQuery"]["intent"]) => {
  if (intent === "buyers" || intent === "importers" || intent === "rfq") return "buyer_rfq";
  return "supplier_offer";
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
    `https://www.alibaba.com/trade/search?SearchText=${encoded}`,
    `https://www.alibaba.com/showroom/${slug}.html`,
    `https://www.alibaba.com/trade/search?SearchText=${encoded}&tab=all`,
    `https://sourcing.alibaba.com/rfq/rfq_search_list.htm?SearchText=${encoded}`
  ];

  if (country) {
    urls.push(`https://www.alibaba.com/trade/search?SearchText=${encoded}&country=${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runAlibabaEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "alibaba" as const,
    sourceName: "Alibaba",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: getResultType(input.parsedQuery.intent),
    includePathHints: ["product", "supplier", "showroom", "company", "rfq", "offer"],
    excludePathHints: ["help", "service", "login", "register", "policy", "blog"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};
