import type { SourceEngineInput, SourceEngineResult } from "../types";
import { runBrowserSourceEngine, runGenericSourceEngine, slugify } from "./shared";

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
    `https://www.kompass.com/en/searchCompanies/?q=${encoded}`,
    `https://www.kompass.com/en/searchProducts/?q=${encoded}`,
    `https://www.kompass.com/en/s/${slug}/`,
    `https://www.kompass.com/en/searchCompanies/?text=${encoded}`
  ];

  if (country) {
    urls.push(`https://www.kompass.com/en/searchCompanies/?q=${encoded}&country=${encodeURIComponent(country)}`);
  }

  return Array.from(new Set(urls));
};

export const runKompassEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  const payload = {
    sourceId: "kompass" as const,
    sourceName: "Kompass",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    resultTypeHint: "company_profile",
    includePathHints: ["company", "search", "supplier", "manufacturers", "en/c/"],
    excludePathHints: ["help", "support", "news", "event"]
  };

  if (executionMode === "browser") {
    return runBrowserSourceEngine(payload);
  }

  return runGenericSourceEngine({ ...payload, executionMode: "fetch" });
};
