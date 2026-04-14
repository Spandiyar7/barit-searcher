import type { ProductCategory, SearchIntent, SourceDescriptor, SourceGroup, SourceId } from "./types";

type SourceSeed = {
  id: SourceId;
  name: string;
  group: SourceGroup;
  intents: SearchIntent[];
  supportsCountries?: boolean;
  engineAvailable?: boolean;
  executionMode?: SourceDescriptor["executionMode"];
  browserCapable?: boolean;
  antiBotRisk?: SourceDescriptor["antiBotRisk"];
  reliabilityScore?: number;
  priorityTier?: SourceDescriptor["priorityTier"];
  purpose?: SourceDescriptor["purpose"];
  industrySpecialization?: string[];
  productCategoryFit?: ProductCategory[];
  defaultRankingWeight?: number;
};

const ALL_TRADE_INTENTS: SearchIntent[] = [
  "buyers",
  "suppliers",
  "manufacturers",
  "importers",
  "exporters",
  "rfq",
  "deals"
];

const buildSource = (seed: SourceSeed): SourceDescriptor => ({
  supportsCountries: true,
  engineAvailable: false,
  executionMode: "manual",
  browserCapable: false,
  antiBotRisk: "medium",
  reliabilityScore: 35,
  priorityTier: 2,
  purpose: "listing",
  industrySpecialization: ["general_trade"],
  productCategoryFit: [
    "petrochemicals",
    "fuels",
    "lng_lpg",
    "polymers",
    "plastics",
    "chemicals",
    "fertilizers",
    "industrial_minerals"
  ],
  defaultRankingWeight: 45,
  ...seed
});

export const SOURCE_CATALOG: SourceDescriptor[] = [
  buildSource({
    id: "petrochemz",
    name: "PetroChemz",
    group: "supplier_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 1,
    industrySpecialization: ["petrochemicals", "polymers", "chemicals"],
    productCategoryFit: ["petrochemicals", "polymers", "plastics", "chemicals", "fuels"],
    antiBotRisk: "medium",
    reliabilityScore: 66,
    defaultRankingWeight: 96
  }),
  buildSource({
    id: "global_trade_plaza",
    name: "Global Trade Plaza",
    group: "rfq_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 1,
    industrySpecialization: ["commodities", "industrial_trade", "chemicals"],
    productCategoryFit: ["petrochemicals", "chemicals", "polymers", "plastics", "fertilizers", "industrial_minerals"],
    antiBotRisk: "medium",
    reliabilityScore: 61,
    defaultRankingWeight: 90
  }),
  buildSource({
    id: "plastic4trade",
    name: "Plastic4Trade",
    group: "supplier_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 1,
    industrySpecialization: ["plastics", "polymers", "resins"],
    productCategoryFit: ["polymers", "plastics", "petrochemicals"],
    antiBotRisk: "medium",
    reliabilityScore: 63,
    defaultRankingWeight: 94
  }),
  buildSource({
    id: "globy",
    name: "Globy",
    group: "supplier_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 1,
    industrySpecialization: ["commodities", "chemicals", "fuels", "agri_trade"],
    productCategoryFit: ["petrochemicals", "fuels", "lng_lpg", "chemicals", "fertilizers", "polymers"],
    antiBotRisk: "medium",
    reliabilityScore: 58,
    defaultRankingWeight: 87
  }),
  buildSource({
    id: "chemnet",
    name: "ChemNet",
    group: "supplier_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 1,
    industrySpecialization: ["chemicals", "petrochemicals", "solvents"],
    productCategoryFit: ["petrochemicals", "chemicals", "polymers", "fertilizers"],
    antiBotRisk: "medium",
    reliabilityScore: 69,
    defaultRankingWeight: 98
  }),
  buildSource({
    id: "toocle",
    name: "Toocle",
    group: "supplier_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 1,
    industrySpecialization: ["industrial_b2b", "chemicals", "manufacturing"],
    productCategoryFit: ["petrochemicals", "chemicals", "polymers", "plastics", "industrial_minerals"],
    antiBotRisk: "medium",
    reliabilityScore: 57,
    defaultRankingWeight: 86
  }),
  buildSource({
    id: "ec21",
    name: "EC21",
    group: "rfq_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 1,
    industrySpecialization: ["industrial_trade", "chemicals", "plastics"],
    productCategoryFit: ["petrochemicals", "polymers", "plastics", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "medium",
    reliabilityScore: 55,
    defaultRankingWeight: 83
  }),
  buildSource({
    id: "exporthub",
    name: "ExportHub",
    group: "rfq_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 1,
    industrySpecialization: ["global_trade", "chemicals", "manufacturing"],
    productCategoryFit: ["petrochemicals", "polymers", "plastics", "chemicals", "fertilizers", "fuels"],
    antiBotRisk: "high",
    reliabilityScore: 49,
    defaultRankingWeight: 80
  }),

  buildSource({
    id: "argus_media",
    name: "Argus Media",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["energy_markets", "fuels", "petrochemicals", "fertilizers"],
    productCategoryFit: ["petrochemicals", "fuels", "lng_lpg", "chemicals", "fertilizers"],
    antiBotRisk: "low",
    reliabilityScore: 78,
    defaultRankingWeight: 76
  }),
  buildSource({
    id: "spglobal_platts",
    name: "S&P Global Platts",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["energy_markets", "oil_gas", "petrochemicals", "metals"],
    productCategoryFit: ["petrochemicals", "fuels", "lng_lpg", "chemicals", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 79,
    defaultRankingWeight: 76
  }),

  buildSource({
    id: "volza",
    name: "Volza",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["import_export_data", "shipment_intelligence"],
    productCategoryFit: ["petrochemicals", "fuels", "polymers", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 64,
    defaultRankingWeight: 72
  }),
  buildSource({
    id: "panjiva",
    name: "Panjiva",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["supply_chain", "import_export_data"],
    productCategoryFit: ["petrochemicals", "fuels", "polymers", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 60,
    defaultRankingWeight: 68
  }),
  buildSource({
    id: "importgenius",
    name: "ImportGenius",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["shipment_data", "import_export_data"],
    productCategoryFit: ["petrochemicals", "fuels", "polymers", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 58,
    defaultRankingWeight: 66
  }),
  buildSource({
    id: "seair",
    name: "Seair",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["trade_data", "shipment_intelligence"],
    productCategoryFit: ["petrochemicals", "fuels", "polymers", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 56,
    defaultRankingWeight: 64
  }),
  buildSource({
    id: "trademo",
    name: "Trademo",
    group: "analytics",
    intents: ["importers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["trade_data", "risk_and_compliance"],
    productCategoryFit: ["petrochemicals", "fuels", "polymers", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 54,
    defaultRankingWeight: 62
  }),
  buildSource({
    id: "asianmetal",
    name: "AsianMetal",
    group: "analytics",
    intents: ["importers", "exporters", "buyers", "suppliers", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["metals", "industrial_minerals", "market_pricing"],
    productCategoryFit: ["industrial_minerals", "chemicals", "fuels"],
    antiBotRisk: "medium",
    reliabilityScore: 57,
    defaultRankingWeight: 63
  }),
  buildSource({
    id: "metal_com",
    name: "Metal.com",
    group: "analytics",
    intents: ["importers", "exporters", "buyers", "suppliers", "deals"],
    priorityTier: 2,
    purpose: "signal",
    industrySpecialization: ["metals", "industrial_minerals", "pricing_signals"],
    productCategoryFit: ["industrial_minerals", "chemicals", "fuels"],
    antiBotRisk: "medium",
    reliabilityScore: 56,
    defaultRankingWeight: 61
  }),

  buildSource({
    id: "kompass",
    name: "Kompass",
    group: "directories",
    intents: ["suppliers", "manufacturers", "buyers", "importers", "exporters", "deals"],
    engineAvailable: true,
    executionMode: "fetch",
    priorityTier: 2,
    purpose: "directory",
    industrySpecialization: ["company_directory", "industrial_suppliers"],
    productCategoryFit: ["petrochemicals", "chemicals", "polymers", "plastics", "fertilizers", "industrial_minerals"],
    antiBotRisk: "medium",
    reliabilityScore: 70,
    defaultRankingWeight: 70
  }),
  buildSource({
    id: "europages",
    name: "Europages",
    group: "directories",
    intents: ["suppliers", "manufacturers", "exporters", "deals"],
    priorityTier: 2,
    purpose: "directory",
    industrySpecialization: ["eu_supplier_directory"],
    productCategoryFit: ["petrochemicals", "polymers", "plastics", "chemicals", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 52,
    defaultRankingWeight: 60
  }),
  buildSource({
    id: "thomasnet",
    name: "ThomasNet",
    group: "directories",
    intents: ["suppliers", "manufacturers", "deals"],
    supportsCountries: false,
    priorityTier: 2,
    purpose: "directory",
    industrySpecialization: ["north_america_industrial_suppliers"],
    productCategoryFit: ["petrochemicals", "polymers", "plastics", "chemicals", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 47,
    defaultRankingWeight: 52
  }),
  buildSource({
    id: "globalspec",
    name: "GlobalSpec",
    group: "directories",
    intents: ["suppliers", "manufacturers", "deals"],
    supportsCountries: false,
    priorityTier: 2,
    purpose: "directory",
    industrySpecialization: ["engineering_directory", "industrial_components"],
    productCategoryFit: ["petrochemicals", "chemicals", "industrial_minerals"],
    antiBotRisk: "low",
    reliabilityScore: 45,
    defaultRankingWeight: 50
  }),

  buildSource({
    id: "go4worldbusiness",
    name: "go4WorldBusiness",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "importers", "exporters", "rfq", "deals"],
    engineAvailable: true,
    executionMode: "fetch",
    priorityTier: 3,
    industrySpecialization: ["general_rfq"],
    productCategoryFit: ["chemicals", "fertilizers", "industrial_minerals", "polymers"],
    antiBotRisk: "high",
    reliabilityScore: 45,
    defaultRankingWeight: 28
  }),
  buildSource({
    id: "tradewheel",
    name: "TradeWheel",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "rfq", "deals"],
    engineAvailable: true,
    executionMode: "fetch",
    browserCapable: true,
    priorityTier: 3,
    industrySpecialization: ["general_rfq"],
    productCategoryFit: ["chemicals", "polymers", "plastics", "fertilizers"],
    antiBotRisk: "high",
    reliabilityScore: 40,
    defaultRankingWeight: 24
  }),
  buildSource({
    id: "tradekey",
    name: "TradeKey",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "rfq", "deals"],
    engineAvailable: true,
    executionMode: "fetch",
    browserCapable: true,
    priorityTier: 3,
    industrySpecialization: ["general_rfq"],
    productCategoryFit: ["chemicals", "polymers", "plastics", "fertilizers"],
    antiBotRisk: "high",
    reliabilityScore: 36,
    defaultRankingWeight: 18
  }),
  buildSource({
    id: "alibaba",
    name: "Alibaba",
    group: "supplier_platforms",
    intents: ["suppliers", "manufacturers", "exporters", "deals", "rfq", "buyers", "importers"],
    engineAvailable: true,
    executionMode: "fetch",
    browserCapable: true,
    priorityTier: 3,
    industrySpecialization: ["broad_b2b"],
    productCategoryFit: ["polymers", "plastics", "chemicals", "fertilizers", "industrial_minerals"],
    antiBotRisk: "high",
    reliabilityScore: 42,
    defaultRankingWeight: 16
  }),

  buildSource({
    id: "eworldtrade",
    name: "eWorldTrade",
    group: "rfq_platforms",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 3,
    antiBotRisk: "high",
    reliabilityScore: 30,
    defaultRankingWeight: 22
  }),
  buildSource({
    id: "made_in_china",
    name: "Made-in-China",
    group: "supplier_platforms",
    intents: ["suppliers", "manufacturers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 37,
    defaultRankingWeight: 27
  }),
  buildSource({
    id: "global_sources",
    name: "Global Sources",
    group: "supplier_platforms",
    intents: ["suppliers", "manufacturers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 38,
    defaultRankingWeight: 29
  }),
  buildSource({
    id: "indiamart",
    name: "IndiaMART",
    group: "supplier_platforms",
    intents: ["suppliers", "manufacturers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "high",
    reliabilityScore: 31,
    defaultRankingWeight: 20
  }),
  buildSource({
    id: "turkishexporter",
    name: "TurkishExporter",
    group: "supplier_platforms",
    intents: ["suppliers", "manufacturers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 30,
    defaultRankingWeight: 24
  }),
  buildSource({
    id: "satu_kz",
    name: "Satu.kz",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "rfq", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 34,
    defaultRankingWeight: 18
  }),
  buildSource({
    id: "avito",
    name: "Avito",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "high",
    reliabilityScore: 25,
    defaultRankingWeight: 12
  }),
  buildSource({
    id: "all_biz",
    name: "All.biz",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 32,
    defaultRankingWeight: 16
  }),
  buildSource({
    id: "tiuru",
    name: "Tiu.ru",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "high",
    reliabilityScore: 24,
    defaultRankingWeight: 12
  }),
  buildSource({
    id: "optlist",
    name: "Optlist",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 28,
    defaultRankingWeight: 14
  }),
  buildSource({
    id: "agroserver",
    name: "Agroserver",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 3,
    antiBotRisk: "medium",
    reliabilityScore: 34,
    defaultRankingWeight: 17
  }),
  buildSource({
    id: "flagma",
    name: "Flagma",
    group: "directories",
    intents: ["buyers", "suppliers", "manufacturers", "importers", "exporters", "deals"],
    priorityTier: 3,
    purpose: "directory",
    antiBotRisk: "medium",
    reliabilityScore: 33,
    defaultRankingWeight: 20
  }),
  buildSource({
    id: "agro_kg",
    name: "Agro.kg",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "low",
    reliabilityScore: 26,
    defaultRankingWeight: 13
  }),
  buildSource({
    id: "tajagro",
    name: "TajAgro",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "low",
    reliabilityScore: 25,
    defaultRankingWeight: 12
  }),
  buildSource({
    id: "gieldarolna",
    name: "GieldaRolna",
    group: "rfq_platforms",
    intents: ["buyers", "suppliers", "manufacturers", "deals"],
    priorityTier: 3,
    antiBotRisk: "low",
    reliabilityScore: 28,
    defaultRankingWeight: 13
  }),
  buildSource({
    id: "gratka",
    name: "Gratka",
    group: "directories",
    intents: ["buyers", "suppliers", "deals"],
    priorityTier: 3,
    purpose: "directory",
    antiBotRisk: "low",
    reliabilityScore: 24,
    defaultRankingWeight: 10
  }),
  buildSource({
    id: "direct_websites",
    name: "Direct Company Websites",
    group: "direct_websites",
    intents: ALL_TRADE_INTENTS,
    priorityTier: 2,
    purpose: "directory",
    industrySpecialization: ["direct_company_domains"],
    productCategoryFit: [
      "petrochemicals",
      "fuels",
      "lng_lpg",
      "polymers",
      "plastics",
      "chemicals",
      "fertilizers",
      "industrial_minerals"
    ],
    antiBotRisk: "low",
    reliabilityScore: 58,
    defaultRankingWeight: 64
  })
];

export const SOURCE_BY_ID = new Map(SOURCE_CATALOG.map((source) => [source.id, source]));
