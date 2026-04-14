export type MarketSearchMode = "buyers" | "suppliers";

export type MarketSearchInput = {
  keyword: string;
  mode: MarketSearchMode;
  country?: string;
};

export type MarketSearchResult = {
  id: string;
  title: string;
  companyName: string | null;
  country: string | null;
  quantity: string | null;
  paymentTerms: string | null;
  shippingTerms: string | null;
  destination: string | null;
  sourceUrl: string;
  snippet: string;
  postedDate: string | null;
  mode: MarketSearchMode;
};

export type MarketSearchResponse = {
  source: "go4WorldBusiness";
  query: MarketSearchInput;
  fetchedUrls: string[];
  warnings: string[];
  results: MarketSearchResult[];
};

export type ImportMarketSearchInput = {
  result: MarketSearchResult;
  keyword?: string;
  withAi?: boolean;
};

export type ImportMarketSearchResponse = {
  status: "imported" | "duplicate";
  leadId: string;
  message: string;
  aiActions?: string[];
};
