import OpenAI from "openai";
import { tokenizeSearch } from "@/lib/utils/query";
import type {
  DesiredResultType,
  MarketIntelligenceSearchInput,
  ParsedQuery,
  ProductCategory,
  SearchIntent,
  SearchPriority
} from "./types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const OPENAI_ENABLED =
  (process.env.AI_PROVIDER || "openai").toLowerCase() === "openai" &&
  Boolean(process.env.OPENAI_API_KEY);

const openai = OPENAI_ENABLED ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const PRODUCT_SYNONYMS: Record<string, string[]> = {
  barite: ["barite", "baryte", "barium sulfate"],
  sulfur: ["sulfur", "sulphur"],
  urea: ["urea", "carbamide"],
  polypropylene: ["polypropylene", "pp raffia", "pp granules", "homo pp"],
  chickpeas: ["chickpeas", "chick pea", "kabuli"],
  lentils: ["lentils", "lentil", "masoor"],
  wheat: ["wheat", "durum", "feed wheat", "milling wheat"],
  "sunflower oil": ["sunflower oil", "sfo", "refined sunflower oil"]
};

const PRODUCT_CATEGORY_KEYWORDS: Record<ProductCategory, string[]> = {
  petrochemicals: [
    "petrochemical",
    "naphtha",
    "ethylene",
    "propylene",
    "benzene",
    "toluene",
    "xylene",
    "methanol"
  ],
  fuels: ["fuel", "diesel", "gasoline", "gasoil", "jet fuel", "fuel oil", "crude oil", "mazut"],
  lng_lpg: ["lng", "lpg", "propane", "butane", "autogas"],
  polymers: [
    "polypropylene",
    "polyethylene",
    "hdpe",
    "ldpe",
    "lldpe",
    "pet resin",
    "pvc resin",
    "polymer"
  ],
  plastics: ["plastic", "masterbatch", "regrind", "polymer granule", "plastic resin"],
  chemicals: ["chemical", "sulfur", "caustic soda", "soda ash", "solvent", "acetic acid", "methanol"],
  fertilizers: ["urea", "ammonium sulfate", "ammonium nitrate", "dap", "map", "npk", "potash", "fertilizer"],
  industrial_minerals: ["barite", "bentonite", "gypsum", "silica", "feldspar", "dolomite", "lime", "kaolin"]
};

const COUNTRY_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "UAE", aliases: ["uae", "united arab emirates", "emirates"] },
  { canonical: "China", aliases: ["china", "prc"] },
  { canonical: "India", aliases: ["india"] },
  { canonical: "Turkey", aliases: ["turkey", "turkiye"] },
  { canonical: "Kazakhstan", aliases: ["kazakhstan", "kz"] },
  { canonical: "Russia", aliases: ["russia", "russian federation"] },
  { canonical: "Egypt", aliases: ["egypt"] },
  { canonical: "Pakistan", aliases: ["pakistan"] },
  { canonical: "Saudi Arabia", aliases: ["saudi arabia", "ksa"] },
  { canonical: "Vietnam", aliases: ["vietnam", "viet nam"] },
  { canonical: "Indonesia", aliases: ["indonesia"] },
  { canonical: "Thailand", aliases: ["thailand"] },
  { canonical: "Uzbekistan", aliases: ["uzbekistan"] },
  { canonical: "Kyrgyzstan", aliases: ["kyrgyzstan"] },
  { canonical: "Tajikistan", aliases: ["tajikistan"] },
  { canonical: "CIS", aliases: ["cis", "commonwealth of independent states"] },
  { canonical: "Europe", aliases: ["europe", "eu", "european union"] },
  { canonical: "Middle East", aliases: ["middle east", "gcc"] }
];

const extractJson = <T>(value: string): T | null => {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

const normalizeText = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const inferProduct = (query: string) => {
  const lowered = query.toLowerCase();
  for (const [product, aliases] of Object.entries(PRODUCT_SYNONYMS)) {
    if (aliases.some((alias) => lowered.includes(alias))) return product;
  }

  return null;
};

const inferProductCategory = (query: string, product: string | null): ProductCategory | null => {
  const lowered = query.toLowerCase();
  const scores = new Map<ProductCategory, number>();

  const bump = (category: ProductCategory, delta: number) => {
    scores.set(category, (scores.get(category) || 0) + delta);
  };

  (Object.entries(PRODUCT_CATEGORY_KEYWORDS) as Array<[ProductCategory, string[]]>).forEach(([category, keywords]) => {
    keywords.forEach((keyword) => {
      if (lowered.includes(keyword)) bump(category, 2);
    });
  });

  if (product) {
    const normalizedProduct = product.toLowerCase();
    if (["polypropylene"].includes(normalizedProduct)) bump("polymers", 3);
    if (["sunflower oil"].includes(normalizedProduct)) bump("fuels", 1);
    if (["urea"].includes(normalizedProduct)) bump("fertilizers", 3);
    if (["sulfur"].includes(normalizedProduct)) bump("chemicals", 3);
    if (["barite"].includes(normalizedProduct)) bump("industrial_minerals", 3);
    if (["chickpeas", "lentils", "wheat"].includes(normalizedProduct)) bump("fertilizers", -1);
  }

  let best: ProductCategory | null = null;
  let bestScore = 0;
  scores.forEach((score, category) => {
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  });

  return bestScore > 0 ? best : null;
};

const inferIntent = (query: string): SearchIntent => {
  const lowered = query.toLowerCase();
  const hasCountry = Boolean(findCountryByFreeText(lowered));

  if (/(rfq|inquiry|buying request|wanted|requirement)/.test(lowered)) return "rfq";
  if (/(manufacturer|factory|mill|producer)/.test(lowered)) return "manufacturers";
  if (/(importer|import)/.test(lowered)) return "importers";
  if (/(exporter|export)/.test(lowered)) return "exporters";
  if (/(supplier|supply|seller|offer available|producers)/.test(lowered)) return "suppliers";
  if (/(deal|transaction|cargo|shipment)/.test(lowered)) return "deals";
  if (/(buyer|buy|procurement|tender)/.test(lowered) && hasCountry) return "importers";
  if (/(buyer|buy|procurement|tender)/.test(lowered)) return "buyers";

  return "buyers";
};

const inferSignalIntents = (
  query: string,
  intent: SearchIntent,
  countryBreakdown: {
    target_country_or_region: string | null;
  }
) => {
  const lowered = query.toLowerCase();
  const hasBuyerLanguage = /(buyer|buyers|buy|procurement|tender|purchase)/.test(lowered);
  const hasSupplierLanguage = /(supplier|suppliers|seller|offer|quote|manufacturer|factory)/.test(lowered);
  const hasImporterLanguage = /(importer|import|importing|destination|arrival)/.test(lowered);
  const hasExporterLanguage = /(exporter|export|origin|fob|exw|shipment from)/.test(lowered);
  const hasRecurringLanguage =
    /(recurring|repeat|repeated|monthly|weekly|regular|ongoing|long[-\s]?term|annual|every month)/.test(lowered);

  const importerIntent =
    intent === "importers" ||
    hasImporterLanguage ||
    ((intent === "buyers" || hasBuyerLanguage) && Boolean(countryBreakdown.target_country_or_region));

  const exporterIntent = intent === "exporters" || hasExporterLanguage || (intent === "suppliers" && hasSupplierLanguage);
  const recurringBuyerIntent = hasRecurringLanguage || (importerIntent && /(monthly|regular|ongoing|long[-\s]?term)/.test(lowered));

  return {
    importer_intent: importerIntent,
    exporter_intent: exporterIntent,
    recurring_buyer_intent: recurringBuyerIntent
  };
};

const findCountryByFreeText = (queryLower: string) => {
  for (const item of COUNTRY_ALIASES) {
    if (item.aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(queryLower))) {
      return item.canonical;
    }
  }

  return null;
};

const findCountryNearKeywords = (queryLower: string, keywords: string[]) => {
  for (const item of COUNTRY_ALIASES) {
    for (const alias of item.aliases) {
      for (const keyword of keywords) {
        const regex = new RegExp(`${keyword}\\s+(?:in|from|to)?\\s*${escapeRegex(alias)}\\b`, "i");
        if (regex.test(queryLower)) return item.canonical;
      }
    }
  }

  return null;
};

const inferCountryBreakdown = (query: string, intent: SearchIntent, overrideCountry?: string | null) => {
  const lowered = query.toLowerCase();

  const buyerCountry =
    findCountryNearKeywords(lowered, ["buyer", "buyers", "importer", "importers", "rfq", "requirement"]) || null;

  const supplierCountry =
    findCountryNearKeywords(lowered, ["supplier", "suppliers", "manufacturer", "manufacturers", "exporter", "exporters"]) ||
    null;

  const destinationCountry =
    findCountryNearKeywords(lowered, ["destination", "to", "delivered to", "cif", "cip", "dap", "ddp"]) || null;

  const originCountry =
    findCountryNearKeywords(lowered, ["origin", "from", "fob", "exw", "fca", "loading from", "port of loading"]) ||
    null;

  const genericCountry = findCountryByFreeText(lowered);
  const normalizedOverride = normalizeText(overrideCountry || "") || null;

  let finalBuyer = buyerCountry;
  let finalSupplier = supplierCountry;
  let finalOrigin = originCountry;
  let finalDestination = destinationCountry;

  if (normalizedOverride) {
    if (!finalDestination && /(to|destination|cif|cip|dap|ddp)/i.test(lowered)) {
      finalDestination = normalizedOverride;
    } else if (!finalOrigin && /(from|origin|fob|exw|fca)/i.test(lowered)) {
      finalOrigin = normalizedOverride;
    } else if ((intent === "buyers" || intent === "importers" || intent === "rfq") && !finalBuyer) {
      finalBuyer = normalizedOverride;
    } else if ((intent === "suppliers" || intent === "manufacturers" || intent === "exporters") && !finalSupplier) {
      finalSupplier = normalizedOverride;
    }
  }

  const target =
    finalDestination || finalBuyer || finalSupplier || finalOrigin || normalizedOverride || genericCountry || null;

  return {
    buyer_country: finalBuyer,
    supplier_country: finalSupplier,
    origin_country: finalOrigin,
    destination_country: finalDestination,
    target_country_or_region: target
  };
};

const inferDesiredResultType = (intent: SearchIntent): DesiredResultType => {
  if (intent === "buyers" || intent === "rfq" || intent === "importers") return "buyer_leads";
  if (intent === "suppliers" || intent === "manufacturers" || intent === "exporters") {
    return "supplier_profiles";
  }
  if (intent === "deals") return "trade_analytics";
  return "mixed";
};

const inferPriority = (query: string): SearchPriority => {
  const lowered = query.toLowerCase();

  if (/(urgent|asap|immediate|spot|today|tender closes|deadline)/.test(lowered)) return "high";
  if (/(research|benchmark|overview|market mapping|directory)/.test(lowered)) return "low";
  return "medium";
};

const normalizeCustomSources = (customSources: string[] | undefined) => {
  if (!customSources || customSources.length === 0) return [];

  return customSources
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      try {
        const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        const url = new URL(withProtocol);
        return url.hostname.replace(/^www\./i, "");
      } catch {
        return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || "";
      }
    })
    .filter(Boolean)
    .slice(0, 8);
};

type AIUnderstandingDraft = {
  product?: string | null;
  product_category?: ProductCategory | null;
  intent?: SearchIntent;
  importer_intent?: boolean;
  exporter_intent?: boolean;
  recurring_buyer_intent?: boolean;
  target_country_or_region?: string | null;
  buyer_country?: string | null;
  supplier_country?: string | null;
  origin_country?: string | null;
  destination_country?: string | null;
  desired_result_type?: DesiredResultType;
  search_priority?: SearchPriority;
  intent_confidence?: number;
};

const getAIUnderstanding = async (
  query: string,
  fallbackIntent: SearchIntent,
  fallbackCountry: string | null
): Promise<AIUnderstandingDraft | null> => {
  if (!openai) return null;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a commodity trading market intelligence router. Return strict JSON with keys: product(string|null), product_category(one of petrochemicals,fuels,lng_lpg,polymers,plastics,chemicals,fertilizers,industrial_minerals|null), intent(one of buyers,suppliers,manufacturers,importers,exporters,rfq,deals), importer_intent(boolean), exporter_intent(boolean), recurring_buyer_intent(boolean), target_country_or_region(string|null), buyer_country(string|null), supplier_country(string|null), origin_country(string|null), destination_country(string|null), desired_result_type(one of buyer_leads,supplier_profiles,company_directory,trade_analytics,mixed), search_priority(one of high,medium,low), intent_confidence(number 0..1)."
        },
        {
          role: "user",
          content: JSON.stringify({ query, fallbackIntent, fallbackCountry })
        }
      ]
    });

    const text = completion.choices[0]?.message?.content ?? "";
    return extractJson<AIUnderstandingDraft>(text);
  } catch {
    return null;
  }
};

const normalizeIntent = (value: string | null | undefined): SearchIntent | null => {
  const normalized = normalizeText(value).toLowerCase();
  const allowed: SearchIntent[] = ["buyers", "suppliers", "manufacturers", "importers", "exporters", "rfq", "deals"];
  return allowed.find((item) => item === normalized) ?? null;
};

const normalizeDesiredResult = (value: string | null | undefined): DesiredResultType | null => {
  const normalized = normalizeText(value).toLowerCase();
  const allowed: DesiredResultType[] = [
    "buyer_leads",
    "supplier_profiles",
    "company_directory",
    "trade_analytics",
    "mixed"
  ];

  return allowed.find((item) => item === normalized) ?? null;
};

const normalizePriority = (value: string | null | undefined): SearchPriority | null => {
  const normalized = normalizeText(value).toLowerCase();
  const allowed: SearchPriority[] = ["high", "medium", "low"];
  return allowed.find((item) => item === normalized) ?? null;
};

const normalizeProductCategory = (value: string | null | undefined): ProductCategory | null => {
  const normalized = normalizeText(value).toLowerCase();
  const allowed: ProductCategory[] = [
    "petrochemicals",
    "fuels",
    "lng_lpg",
    "polymers",
    "plastics",
    "chemicals",
    "fertilizers",
    "industrial_minerals"
  ];
  return allowed.find((item) => item === normalized) ?? null;
};

const normalizeCountryValue = (value: string | null | undefined) => {
  const cleaned = normalizeText(value);
  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();
  for (const item of COUNTRY_ALIASES) {
    if (item.aliases.some((alias) => alias.toLowerCase() === lowered)) {
      return item.canonical;
    }
  }

  return cleaned;
};

export const understandMarketQuery = async (input: MarketIntelligenceSearchInput): Promise<ParsedQuery> => {
  const query = normalizeText(input.query);
  const intent = input.intent || inferIntent(query);
  const product = inferProduct(query);
  const productCategory = inferProductCategory(query, product);
  const countryBreakdown = inferCountryBreakdown(query, intent, input.country);
  const signalIntents = inferSignalIntents(query, intent, countryBreakdown);

  const heuristic: ParsedQuery = {
    query,
    product,
    product_category: productCategory,
    intent,
    importer_intent: signalIntents.importer_intent,
    exporter_intent: signalIntents.exporter_intent,
    recurring_buyer_intent: signalIntents.recurring_buyer_intent,
    target_country_or_region: countryBreakdown.target_country_or_region,
    buyer_country: countryBreakdown.buyer_country,
    supplier_country: countryBreakdown.supplier_country,
    origin_country: countryBreakdown.origin_country,
    destination_country: countryBreakdown.destination_country,
    desired_result_type: inferDesiredResultType(intent),
    search_priority: inferPriority(query),
    intent_confidence: 0.64,
    tokens: tokenizeSearch(query),
    custom_sources: normalizeCustomSources(input.customSources)
  };

  const aiDraft = await getAIUnderstanding(query, intent, countryBreakdown.target_country_or_region);

  if (!aiDraft) return heuristic;

  const aiIntent = normalizeIntent(aiDraft.intent || null);
  const aiProductCategory = normalizeProductCategory(aiDraft.product_category || null);
  const aiDesired = normalizeDesiredResult(aiDraft.desired_result_type || null);
  const aiPriority = normalizePriority(aiDraft.search_priority || null);
  const aiConfidence =
    typeof aiDraft.intent_confidence === "number" && Number.isFinite(aiDraft.intent_confidence)
      ? Math.max(0, Math.min(aiDraft.intent_confidence, 1))
      : heuristic.intent_confidence;
  const aiImporterIntent = typeof aiDraft.importer_intent === "boolean" ? aiDraft.importer_intent : heuristic.importer_intent;
  const aiExporterIntent = typeof aiDraft.exporter_intent === "boolean" ? aiDraft.exporter_intent : heuristic.exporter_intent;
  const aiRecurringBuyerIntent =
    typeof aiDraft.recurring_buyer_intent === "boolean" ? aiDraft.recurring_buyer_intent : heuristic.recurring_buyer_intent;

  const buyerCountry = normalizeCountryValue(aiDraft.buyer_country) || heuristic.buyer_country;
  const supplierCountry = normalizeCountryValue(aiDraft.supplier_country) || heuristic.supplier_country;
  const originCountry = normalizeCountryValue(aiDraft.origin_country) || heuristic.origin_country;
  const destinationCountry = normalizeCountryValue(aiDraft.destination_country) || heuristic.destination_country;
  const targetCountry =
    normalizeCountryValue(aiDraft.target_country_or_region) ||
    destinationCountry ||
    buyerCountry ||
    supplierCountry ||
    originCountry ||
    heuristic.target_country_or_region;

  let resolvedIntent = input.intent || aiIntent || heuristic.intent;
  if (!input.intent && resolvedIntent === "buyers" && aiImporterIntent) {
    resolvedIntent = "importers";
  }
  if (!input.intent && resolvedIntent === "suppliers" && aiExporterIntent) {
    resolvedIntent = "exporters";
  }

  const aiProduct = normalizeText(aiDraft.product || null) || heuristic.product;
  const resolvedProductCategory = aiProductCategory || inferProductCategory(query, aiProduct) || heuristic.product_category;

  return {
    ...heuristic,
    product: aiProduct,
    product_category: resolvedProductCategory,
    intent: resolvedIntent,
    importer_intent: aiImporterIntent,
    exporter_intent: aiExporterIntent,
    recurring_buyer_intent: aiRecurringBuyerIntent,
    target_country_or_region: targetCountry,
    buyer_country: buyerCountry,
    supplier_country: supplierCountry,
    origin_country: originCountry,
    destination_country: destinationCountry,
    desired_result_type: aiDesired || heuristic.desired_result_type,
    search_priority: aiPriority || heuristic.search_priority,
    intent_confidence: aiConfidence
  };
};
