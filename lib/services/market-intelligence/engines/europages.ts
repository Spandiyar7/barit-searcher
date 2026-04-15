import type { SourceEngineInput, SourceEngineResult } from "../types";
import { runDirectoryDiscoveryEngine } from "./directory-discovery";
import { slugify } from "./shared";

const buildSearchUrls = (input: SourceEngineInput) => {
  const keyword = input.parsedQuery.product || input.parsedQuery.query;
  const encoded = encodeURIComponent(keyword);
  const slug = slugify(keyword);
  const country =
    input.parsedQuery.target_country_or_region ||
    input.parsedQuery.supplier_country ||
    input.parsedQuery.buyer_country ||
    "";
  const countrySlug = country ? slugify(country) : "";

  const urls = [
    `https://www.europages.com/search?q=${encoded}`,
    `https://www.europages.com/en/search?keywords=${encoded}`,
    `https://www.europages.com/companies/${slug}.html`,
    `https://www.europages.com/companies/${slug}/`,
    `https://www.europages.com/companies/${slug}.html?query=${encoded}`
  ];

  if (country) {
    urls.push(`https://www.europages.com/search?q=${encoded}&country=${encodeURIComponent(country)}`);
    urls.push(`https://www.europages.com/en/search?keywords=${encoded}&country=${encodeURIComponent(country)}`);
    if (countrySlug) {
      urls.push(`https://www.europages.com/companies/${countrySlug}/`);
      urls.push(`https://www.europages.com/companies/${countrySlug}/${slug}.html`);
      urls.push(`https://www.europages.com/companies/${countrySlug}/${slug}/`);
    }
  }

  return Array.from(new Set(urls));
};

export const runEuropagesEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const executionMode = input.executionMode || input.source.executionMode;
  return runDirectoryDiscoveryEngine({
    sourceId: "europages",
    sourceName: "Europages",
    parsedQuery: input.parsedQuery,
    searchUrls: buildSearchUrls(input),
    maxResults: input.maxResults,
    executionMode,
    includePathHints: [
      "/company",
      "/companies",
      "/supplier",
      "/suppliers",
      "/manufact",
      "/profile",
      "/import",
      "/export",
      "/distributor",
      "-company-",
      "-supplier-"
    ],
    excludePathHints: ["privacy", "cookie", "terms", "help", "support", "news", "login", "register"]
  });
};
