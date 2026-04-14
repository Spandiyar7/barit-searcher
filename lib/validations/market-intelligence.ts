import { z } from "zod";

const searchIntentSchema = z.enum([
  "buyers",
  "suppliers",
  "manufacturers",
  "importers",
  "exporters",
  "rfq",
  "deals"
]);

const optionalText = z
  .union([z.string().trim().max(5000), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

export const marketIntelligenceQuerySchema = z.object({
  q: z.string().trim().min(2).max(180),
  country: z.string().trim().max(100).optional().default(""),
  intent: searchIntentSchema.optional(),
  maxSources: z.coerce.number().int().min(1).max(8).optional().default(5),
  maxResultsPerSource: z.coerce.number().int().min(3).max(25).optional().default(12),
  customSources: z.string().trim().max(1000).optional().default("")
});

export const parsedQuerySchema = z.object({
  query: z.string().trim().min(1).max(180),
  product: optionalText,
  product_category: z
    .enum([
      "petrochemicals",
      "fuels",
      "lng_lpg",
      "polymers",
      "plastics",
      "chemicals",
      "fertilizers",
      "industrial_minerals"
    ])
    .nullable()
    .optional()
    .default(null),
  intent: searchIntentSchema,
  importer_intent: z.boolean().optional().default(false),
  exporter_intent: z.boolean().optional().default(false),
  recurring_buyer_intent: z.boolean().optional().default(false),
  target_country_or_region: optionalText,
  buyer_country: optionalText,
  supplier_country: optionalText,
  origin_country: optionalText,
  destination_country: optionalText,
  desired_result_type: z.enum([
    "buyer_leads",
    "supplier_profiles",
    "company_directory",
    "trade_analytics",
    "mixed"
  ]),
  search_priority: z.enum(["high", "medium", "low"]),
  intent_confidence: z.number().min(0).max(1),
  tokens: z.array(z.string().trim().min(1)).max(40),
  custom_sources: z.array(z.string().trim().min(1).max(250)).max(8)
});

export const normalizedMarketResultSchema = z.object({
  id: z.string().trim().min(1).max(64),
  product: optionalText,
  company: optionalText,
  contact_name: optionalText,
  country: optionalText,
  quantity: optionalText,
  incoterms: optionalText,
  payment_terms: optionalText,
  description: z.string().trim().min(2).max(8000),
  source_name: z.string().trim().min(2).max(120),
  source_url: z.string().trim().url(),
  raw_text: z.string().trim().min(2).max(20000),
  result_type: z.string().trim().min(2).max(120),
  confidence_score: z.number().min(0).max(1),
  shipping_terms: optionalText,
  destination: optionalText,
  posted_date: optionalText,
  source_kind: z.enum(["live", "mock", "test", "fallback"]).optional(),
  import_mode: z.enum(["fetch", "browser", "manual", "generated"]).optional(),
  ai_classification: z.enum(["buyer", "supplier", "trader", "importer", "exporter"]).optional(),
  ai_summary: optionalText.optional(),
  relevance_score: z.number().min(0).max(1).optional(),
  next_action: optionalText.optional()
});

export const marketIntelligenceImportSchema = z.object({
  result: normalizedMarketResultSchema,
  parsed_query: parsedQuerySchema.optional(),
  save_company: z.boolean().optional().default(true),
  with_ai: z.boolean().optional().default(false)
});

export const marketIntelligenceManualImportSchema = z
  .object({
    source_name: z.string().trim().max(120).optional().default(""),
    source_url: z.string().trim().max(2000).optional().default(""),
    page_text: z.string().trim().max(40000).optional().default(""),
    query: z.string().trim().max(180).optional().default(""),
    parsed_query: parsedQuerySchema.optional(),
    save_company: z.boolean().optional().default(true),
    with_ai: z.boolean().optional().default(true)
  })
  .refine((payload) => payload.source_url.length > 0 || payload.page_text.length > 0, {
    message: "Provide source_url or page_text for manual import",
    path: ["source_url"]
  });

export const marketIntelligenceCreateJobSchema = z.object({
  q: z.string().trim().min(2).max(180),
  country: z.string().trim().max(100).optional().default(""),
  intent: searchIntentSchema.optional(),
  maxSources: z.coerce.number().int().min(1).max(8).optional().default(5),
  maxResultsPerSource: z.coerce.number().int().min(3).max(25).optional().default(12),
  customSources: z.string().trim().max(1000).optional().default(""),
  savedSearchId: z.string().trim().max(50).optional().default("")
});

export const marketIntelligenceSavedSearchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  keyword: z.string().trim().min(2).max(180),
  country: z.string().trim().max(100).optional().default(""),
  intent: searchIntentSchema.optional(),
  customSources: z.string().trim().max(1000).optional().default(""),
  frequencyHours: z.coerce.number().int().min(1).max(168).default(24),
  isActive: z.coerce.boolean().optional().default(true)
});
