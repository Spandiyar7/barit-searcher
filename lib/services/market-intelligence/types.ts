export type SearchIntent =
  | "buyers"
  | "suppliers"
  | "manufacturers"
  | "importers"
  | "exporters"
  | "rfq"
  | "deals";

export type DesiredResultType =
  | "buyer_leads"
  | "supplier_profiles"
  | "company_directory"
  | "trade_analytics"
  | "mixed";

export type SearchPriority = "high" | "medium" | "low";
export type TradingSignalFocus = "importer" | "exporter" | "recurring_buyer" | "manufacturer" | "general";
export type SourcePriorityTier = 1 | 2 | 3;
export type SourcePurpose = "listing" | "signal" | "directory";
export type ProductCategory =
  | "petrochemicals"
  | "fuels"
  | "lng_lpg"
  | "polymers"
  | "plastics"
  | "chemicals"
  | "fertilizers"
  | "industrial_minerals";

export type SourceGroup = "rfq_platforms" | "supplier_platforms" | "directories" | "analytics" | "direct_websites";

export type SourceExecutionMode = "fetch" | "browser" | "manual";
export type ResultImportMode = SourceExecutionMode | "generated";
export type SourceKind = "live" | "mock" | "test" | "fallback";

export type AntiBotRisk = "low" | "medium" | "high";

export type ParseStatus = "success" | "empty" | "failed" | "skipped";

export type SourceStatus = "ok" | "blocked" | "error" | "manual";

export type SourceId =
  | "petrochemz"
  | "global_trade_plaza"
  | "plastic4trade"
  | "globy"
  | "chemnet"
  | "toocle"
  | "go4worldbusiness"
  | "tradewheel"
  | "tradekey"
  | "eworldtrade"
  | "ec21"
  | "exporthub"
  | "alibaba"
  | "made_in_china"
  | "global_sources"
  | "indiamart"
  | "turkishexporter"
  | "europages"
  | "kompass"
  | "thomasnet"
  | "globalspec"
  | "volza"
  | "panjiva"
  | "importgenius"
  | "seair"
  | "trademo"
  | "argus_media"
  | "spglobal_platts"
  | "asianmetal"
  | "metal_com"
  | "satu_kz"
  | "avito"
  | "all_biz"
  | "tiuru"
  | "optlist"
  | "agroserver"
  | "flagma"
  | "agro_kg"
  | "tajagro"
  | "gieldarolna"
  | "gratka"
  | "direct_websites";

export type SourceDescriptor = {
  id: SourceId;
  name: string;
  group: SourceGroup;
  priorityTier: SourcePriorityTier;
  purpose: SourcePurpose;
  industrySpecialization: string[];
  productCategoryFit: ProductCategory[];
  defaultRankingWeight: number;
  intents: SearchIntent[];
  supportsCountries: boolean;
  engineAvailable: boolean;
  executionMode: SourceExecutionMode;
  browserCapable: boolean;
  antiBotRisk: AntiBotRisk;
  reliabilityScore: number;
};

export type MarketIntelligenceSearchInput = {
  query: string;
  country?: string | null;
  intent?: SearchIntent | null;
  customSources?: string[];
  maxSources?: number;
  maxResultsPerSource?: number;
};

export type ParsedQuery = {
  query: string;
  product: string | null;
  product_category: ProductCategory | null;
  intent: SearchIntent;
  importer_intent: boolean;
  exporter_intent: boolean;
  recurring_buyer_intent: boolean;
  target_country_or_region: string | null;
  buyer_country: string | null;
  supplier_country: string | null;
  origin_country: string | null;
  destination_country: string | null;
  desired_result_type: DesiredResultType;
  search_priority: SearchPriority;
  intent_confidence: number;
  tokens: string[];
  custom_sources: string[];
};

export type SourceRecommendation = {
  source_id: SourceId;
  source_name: string;
  group: SourceGroup;
  priority_tier: SourcePriorityTier;
  purpose: SourcePurpose;
  product_category_fit: ProductCategory[];
  industry_specialization: string[];
  score: number;
  reason: string;
  engine_available: boolean;
  execution_mode: SourceExecutionMode;
  anti_bot_risk: AntiBotRisk;
  reliability_score: number;
};

export type MarketRole = "buyer" | "supplier" | "trader" | "importer" | "exporter";

export type NormalizedMarketResult = {
  id: string;
  product: string | null;
  company: string | null;
  contact_name: string | null;
  country: string | null;
  quantity: string | null;
  incoterms: string | null;
  payment_terms: string | null;
  description: string;
  source_name: string;
  source_url: string;
  raw_text: string;
  result_type: string;
  confidence_score: number;
  shipping_terms: string | null;
  destination: string | null;
  posted_date: string | null;
  source_kind?: SourceKind;
  import_mode?: ResultImportMode;
  ai_classification?: MarketRole;
  ai_summary?: string | null;
  relevance_score?: number;
  next_action?: string | null;
};

export type SourceEngineInput = {
  parsedQuery: ParsedQuery;
  source: SourceDescriptor;
  maxResults: number;
  executionMode?: SourceExecutionMode;
};

export type SourceEngine = (input: SourceEngineInput) => Promise<SourceEngineResult>;

export type SourceEngineResult = {
  sourceId: SourceId;
  sourceName: string;
  execution_mode: SourceExecutionMode;
  fetchedUrls: string[];
  warnings: string[];
  http_statuses: number[];
  response_status: number | null;
  blocked: boolean;
  anti_bot_detected: boolean;
  parse_status: ParseStatus;
  status: SourceStatus;
  extracted_results: number;
  results: NormalizedMarketResult[];
};

export type SourceDiagnostic = {
  source_id: SourceId;
  source_name: string;
  priority_tier?: SourcePriorityTier;
  status: SourceStatus;
  execution_mode: SourceExecutionMode;
  attempted_modes: SourceExecutionMode[];
  anti_bot_risk: AntiBotRisk;
  reliability_score: number;
  response_status: number | null;
  parse_status: ParseStatus;
  extracted_results: number;
  blocked: boolean;
  selection_reason?: string;
  warnings: string[];
  open_source_url: string | null;
  save_search_url: string | null;
};

export type MarketIntelligenceSearchResponse = {
  parsed_query: ParsedQuery;
  recommended_sources: SourceRecommendation[];
  executed_sources: string[];
  source_diagnostics: SourceDiagnostic[];
  warnings: string[];
  results: NormalizedMarketResult[];
};

export type MarketIntelligenceImportInput = {
  result: NormalizedMarketResult;
  parsed_query?: ParsedQuery;
  save_company?: boolean;
  with_ai?: boolean;
};

export type MarketIntelligenceImportResponse = {
  status: "imported" | "duplicate";
  leadId: string;
  companyId?: string;
  contactId?: string;
  message: string;
};

export type MarketIntelligenceManualImportInput = {
  source_name?: string;
  source_url?: string;
  page_text?: string;
  query?: string;
  parsed_query?: ParsedQuery;
  save_company?: boolean;
  with_ai?: boolean;
};

export type MarketIntelligenceManualImportResponse = {
  extracted: {
    title: string;
    product: string | null;
    lead_type: string;
    volume: number | null;
    unit: string | null;
    price: number | null;
    currency: string | null;
    incoterms: string | null;
    origin_country: string | null;
    destination_country: string | null;
    confidence: number;
  };
  imported: MarketIntelligenceImportResponse;
};

export type MarketIntelligenceJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";

export type MarketIntelligenceSourceRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED" | "SKIPPED";

export type ResultPersistenceStatus = "imported" | "duplicate" | "staged" | "logged";

export type JobResultItem = NormalizedMarketResult & {
  persistence_status: ResultPersistenceStatus;
  persistence_message?: string;
  lead_id?: string;
  raw_lead_id?: string;
};

export type SearchJobSummary = {
  id: string;
  status: MarketIntelligenceJobStatus;
  query: string;
  country: string | null;
  intent: SearchIntent | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  total_sources: number;
  processed_sources: number;
  total_results: number;
  imported_leads: number;
  saved_raw_leads: number;
  low_confidence_dropped: number;
  error_message: string | null;
};

export type SearchJobSourceRun = {
  id: string;
  source_id: SourceId | string;
  source_name: string;
  execution_mode: SourceExecutionMode | string;
  status: MarketIntelligenceSourceRunStatus;
  started_at: string | null;
  completed_at: string | null;
  response_status: number | null;
  parse_status: ParseStatus | string | null;
  extracted_results: number;
  imported_leads: number;
  saved_raw_leads: number;
  blocked: boolean;
  warnings: string[];
};

export type MarketIntelligenceJobSnapshot = {
  job: SearchJobSummary;
  parsed_query: ParsedQuery;
  recommended_sources: SourceRecommendation[];
  source_diagnostics: SourceDiagnostic[];
  source_runs: SearchJobSourceRun[];
  warnings: string[];
  results: JobResultItem[];
};

export type CreateSearchJobInput = MarketIntelligenceSearchInput & {
  savedSearchId?: string | null;
};

export type CreateSearchJobResponse = {
  job_id: string;
  status: MarketIntelligenceJobStatus;
};

export type SavedSearchInput = {
  name: string;
  keyword: string;
  country?: string | null;
  intent?: SearchIntent | null;
  customSources?: string[];
  frequencyHours: number;
  isActive?: boolean;
};

export type SavedSearchItem = {
  id: string;
  name: string;
  keyword: string;
  country: string | null;
  intent: SearchIntent | null;
  custom_sources: string[];
  frequency_hours: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
};

export type SourcePerformanceSnapshot = {
  source_id: string;
  intent: SearchIntent | "any";
  total_runs: number;
  success_count: number;
  blocked_count: number;
  average_extracted: number;
  average_relevance: number;
  last_success_at: string | null;
};
