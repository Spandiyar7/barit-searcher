import { LeadPriority, type LeadType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSearchJobSnapshot, type JobResultItem, type SearchIntent } from "@/lib/services/market-intelligence";
import { getSourcePerformanceDashboardData } from "@/lib/services/source-performance";

export type LeadDatabaseRole = "buyer" | "supplier" | "importer" | "exporter" | "manufacturer" | "trader";
export type LeadDatabaseTier = "ready" | "actionable" | "signal";

export type WhyMatchedCode =
  | "roleRelevance"
  | "contactCompleteness"
  | "sourceQuality"
  | "tradeSignal"
  | "volumePresent"
  | "countryMatch"
  | "productMatch"
  | "repeatedSourceSignals";

export type LeadDatabaseItem = {
  id: string;
  leadId: string;
  company: string;
  role: LeadDatabaseRole;
  country: string | null;
  city: string | null;
  product: string | null;
  volume: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  website: string | null;
  sourceName: string;
  sourceUrl: string;
  confidenceScore: number;
  rankingScore: number;
  tier: LeadDatabaseTier;
  whyMatched: WhyMatchedCode[];
  hasContact: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasVolume: boolean;
  searchJobId: string | null;
  createdAt: string;
};

export type LeadDatabaseSnapshot = {
  job: {
    id: string;
    status: string;
    query: string;
    createdAt: string;
    parsedIntent: SearchIntent;
    targetCountry: string | null;
  };
  totals: {
    readyLeads: number;
    actionableLeads: number;
    withContacts: number;
    withVolume: number;
    averageConfidence: number;
  };
  leads: LeadDatabaseItem[];
};

export type LeadDatabaseListFilters = {
  q?: string;
  product?: string;
  role?: string;
  country?: string;
  source?: string;
  confidence?: number;
  has_contact?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  has_volume?: boolean;
  tier?: LeadDatabaseTier;
  limit?: number;
};

export type LeadDatabaseListResponse = {
  totals: {
    total: number;
    readyLeads: number;
    actionableLeads: number;
    withContacts: number;
    withVolume: number;
    averageConfidence: number;
  };
  leads: LeadDatabaseItem[];
};

type CompanySignalStats = {
  count: number;
  sources: Set<string>;
};

type LeadWithRelations = Prisma.LeadGetPayload<{
  include: {
    product: true;
    company: {
      include: {
        contacts: true;
      };
    };
    rawMarketLeads: true;
  };
}>;

const normalizeText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();

const normalizeCompanyKey = (value: string | null | undefined) => normalizeText(value).toLowerCase();

const toRoleFromLeadType = (leadType: LeadType): LeadDatabaseRole => {
  if (leadType === "BUY") return "buyer";
  if (leadType === "SELL") return "supplier";
  return "trader";
};

const inferRole = (leadType: LeadType, result?: JobResultItem): LeadDatabaseRole => {
  const ai = (result?.ai_classification || "").toLowerCase();
  const text = `${result?.result_type || ""} ${result?.description || ""}`.toLowerCase();

  if (/manufacturer|factory|mill|producer/.test(text)) return "manufacturer";
  if (ai === "importer") return "importer";
  if (ai === "exporter") return "exporter";
  if (ai === "buyer") return "buyer";
  if (ai === "supplier") return "supplier";
  if (/import/.test(text)) return "importer";
  if (/export/.test(text)) return "exporter";

  return toRoleFromLeadType(leadType);
};

const clamp01 = (value: number) => Math.max(0.05, Math.min(0.99, value));

const priorityScore = (priority: LeadPriority) => {
  if (priority === "HIGH") return 0.82;
  if (priority === "LOW") return 0.52;
  return 0.67;
};

const toVolumeLabel = (value: Prisma.Decimal | null, unit: string | null) => {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${numeric}${unit ? ` ${unit}` : ""}`;
};

const roleRelevance = (intent: SearchIntent | null, role: LeadDatabaseRole) => {
  if (!intent) return 0.7;
  if (intent === "buyers" || intent === "importers" || intent === "rfq") {
    if (role === "buyer" || role === "importer") return 1;
    if (role === "trader") return 0.65;
    return 0.35;
  }

  if (intent === "suppliers" || intent === "manufacturers" || intent === "exporters") {
    if (role === "supplier" || role === "manufacturer" || role === "exporter") return 1;
    if (role === "trader") return 0.65;
    return 0.35;
  }

  return 0.75;
};

const contactCompleteness = (payload: {
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
}) => {
  let score = 0;
  if (payload.contactPerson) score += 0.2;
  if (payload.email) score += 0.25;
  if (payload.phone) score += 0.25;
  if (payload.telegram) score += 0.15;
  if (payload.whatsapp) score += 0.15;
  return Math.min(1, score);
};

const tradeSignalScore = (resultType: string) => {
  const lowered = (resultType || "").toLowerCase();
  if (lowered.includes("recurring_buyer_signal")) return 1;
  if (lowered.includes("importer_signal") || lowered.includes("exporter_signal")) return 0.85;
  if (lowered.includes("rfq") || lowered.includes("offer")) return 0.55;
  return 0.45;
};

const buildWhyMatched = (payload: {
  roleRelevanceScore: number;
  contactScore: number;
  sourceQuality: number;
  signalScore: number;
  hasVolume: boolean;
  countryMatch: boolean;
  productMatch: boolean;
  repeatedSignals: boolean;
}) => {
  const reasons: WhyMatchedCode[] = [];
  if (payload.roleRelevanceScore >= 0.8) reasons.push("roleRelevance");
  if (payload.contactScore >= 0.45) reasons.push("contactCompleteness");
  if (payload.sourceQuality >= 0.55) reasons.push("sourceQuality");
  if (payload.signalScore >= 0.75) reasons.push("tradeSignal");
  if (payload.hasVolume) reasons.push("volumePresent");
  if (payload.countryMatch) reasons.push("countryMatch");
  if (payload.productMatch) reasons.push("productMatch");
  if (payload.repeatedSignals) reasons.push("repeatedSourceSignals");
  return reasons;
};

const classifyTier = (payload: {
  confidenceScore: number;
  hasContact: boolean;
  hasCompany: boolean;
  signalScore: number;
}) => {
  if (payload.confidenceScore >= 72 && payload.hasContact) return "ready" as const;
  if (payload.confidenceScore >= 58 && payload.hasCompany && payload.signalScore >= 0.45) return "actionable" as const;
  return "signal" as const;
};

const parseNormalizedResultFromRaw = (value: Prisma.JsonValue | null): JobResultItem | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const sourceUrl = normalizeText(typeof candidate.source_url === "string" ? candidate.source_url : "");
  const sourceName = normalizeText(typeof candidate.source_name === "string" ? candidate.source_name : "");
  if (!sourceUrl || !sourceName) return null;

  return {
    id: normalizeText(typeof candidate.id === "string" ? candidate.id : sourceUrl),
    product: typeof candidate.product === "string" ? candidate.product : null,
    company: typeof candidate.company === "string" ? candidate.company : null,
    contact_name: typeof candidate.contact_name === "string" ? candidate.contact_name : null,
    country: typeof candidate.country === "string" ? candidate.country : null,
    quantity: typeof candidate.quantity === "string" ? candidate.quantity : null,
    incoterms: typeof candidate.incoterms === "string" ? candidate.incoterms : null,
    payment_terms: typeof candidate.payment_terms === "string" ? candidate.payment_terms : null,
    description: typeof candidate.description === "string" ? candidate.description : "",
    source_name: sourceName,
    source_url: sourceUrl,
    raw_text: typeof candidate.raw_text === "string" ? candidate.raw_text : "",
    result_type: typeof candidate.result_type === "string" ? candidate.result_type : "market_listing",
    confidence_score: typeof candidate.confidence_score === "number" ? candidate.confidence_score : 0.5,
    shipping_terms: typeof candidate.shipping_terms === "string" ? candidate.shipping_terms : null,
    destination: typeof candidate.destination === "string" ? candidate.destination : null,
    posted_date: typeof candidate.posted_date === "string" ? candidate.posted_date : null,
    source_kind: ["live", "mock", "test", "fallback"].includes(String(candidate.source_kind))
      ? (candidate.source_kind as JobResultItem["source_kind"])
      : undefined,
    import_mode: ["fetch", "browser", "manual", "generated"].includes(String(candidate.import_mode))
      ? (candidate.import_mode as JobResultItem["import_mode"])
      : undefined,
    ai_classification: ["buyer", "supplier", "trader", "importer", "exporter"].includes(String(candidate.ai_classification))
      ? (candidate.ai_classification as JobResultItem["ai_classification"])
      : undefined,
    ai_summary: typeof candidate.ai_summary === "string" ? candidate.ai_summary : null,
    relevance_score: typeof candidate.relevance_score === "number" ? candidate.relevance_score : undefined,
    next_action: typeof candidate.next_action === "string" ? candidate.next_action : null,
    persistence_status: "logged"
  };
};

const getSourceQualityMap = async () => {
  const dashboard = await getSourcePerformanceDashboardData();
  const map = new Map<string, number>();
  dashboard.rows.forEach((row) => {
    const score =
      row.fetchSuccessRate * 0.22 +
      row.parseSuccessRate * 0.23 +
      row.successRate * 0.25 +
      row.importedLeadRate * 0.3;
    map.set(row.sourceName.toLowerCase(), Math.max(0.2, Math.min(1, score / 100)));
  });
  return map;
};

const dedupeItems = (items: LeadDatabaseItem[]) => {
  const byKey = new Map<string, LeadDatabaseItem>();
  for (const item of items) {
    const key = [
      normalizeCompanyKey(item.company),
      normalizeText(item.email).toLowerCase(),
      normalizeText(item.phone),
      normalizeText(item.product).toLowerCase(),
      normalizeText(item.sourceUrl).toLowerCase()
    ].join("|");

    const existing = byKey.get(key);
    if (!existing || item.rankingScore > existing.rankingScore) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
};

const buildCompanySignalMap = (results: JobResultItem[]) => {
  const map = new Map<string, CompanySignalStats>();
  results.forEach((result) => {
    const key = normalizeCompanyKey(result.company);
    if (!key) return;
    const current = map.get(key) || { count: 0, sources: new Set<string>() };
    current.count += 1;
    current.sources.add((result.source_name || "").toLowerCase());
    map.set(key, current);
  });
  return map;
};

const toLeadDatabaseItem = (input: {
  lead: LeadWithRelations;
  result: JobResultItem | null;
  parsedIntent: SearchIntent | null;
  targetCountry: string | null;
  parsedProduct: string | null;
  sourceQualityMap: Map<string, number>;
  companySignalMap: Map<string, CompanySignalStats>;
  searchJobId: string | null;
}): LeadDatabaseItem => {
  const contact =
    input.lead.company?.contacts.find((item) => Boolean(item.email || item.phone || item.telegram || item.whatsapp || item.fullName)) ||
    null;

  const country =
    input.lead.destinationCountry || input.lead.originCountry || input.lead.company?.country || input.result?.country || input.result?.destination || null;

  const role = inferRole(input.lead.leadType, input.result || undefined);

  const confidenceRaw =
    input.result?.relevance_score ??
    input.result?.confidence_score ??
    input.lead.rawMarketLeads[0]?.relevanceScore ??
    input.lead.rawMarketLeads[0]?.confidenceScore ??
    priorityScore(input.lead.priority);
  const confidence = clamp01(confidenceRaw ?? 0.6);

  const sourceName = input.result?.source_name || input.lead.sourceName || "Unknown";
  const sourceUrl = input.result?.source_url || input.lead.sourceUrl || "";
  const signalScore = tradeSignalScore(input.result?.result_type || "");
  const sourceQuality = input.sourceQualityMap.get(sourceName.toLowerCase()) || 0.45;

  const contactPerson = contact?.fullName || input.result?.contact_name || null;
  const email = contact?.email || null;
  const phone = contact?.phone || null;
  const telegram = contact?.telegram || null;
  const whatsapp = contact?.whatsapp || null;
  const website = input.lead.company?.website || null;

  const contactScore = contactCompleteness({
    contactPerson,
    email,
    phone,
    telegram,
    whatsapp
  });

  const hasVolume = Boolean(input.lead.volume || input.result?.quantity);
  const volume = toVolumeLabel(input.lead.volume, input.lead.unit) || input.result?.quantity || null;
  const hasContact = Boolean(contactPerson || email || phone || telegram || whatsapp);
  const hasEmail = Boolean(email);
  const hasPhone = Boolean(phone);
  const hasCompany = Boolean((input.lead.company?.name || input.result?.company || "").trim());

  const roleScore = roleRelevance(input.parsedIntent, role);
  const companyKey = normalizeCompanyKey(input.lead.company?.name || input.result?.company);
  const signalStats = input.companySignalMap.get(companyKey);
  const repeatedSignals = Boolean(signalStats && signalStats.count >= 2 && signalStats.sources.size >= 2);

  const countryMatched = Boolean(
    input.targetCountry && (country || "").toLowerCase().includes(input.targetCountry.toLowerCase())
  );
  const productName = input.lead.product?.name || input.result?.product || null;
  const productMatched = Boolean(
    input.parsedProduct && normalizeText(productName).toLowerCase().includes(input.parsedProduct.toLowerCase())
  );

  const ranking =
    confidence * 0.34 +
    roleScore * 0.16 +
    contactScore * 0.2 +
    sourceQuality * 0.12 +
    signalScore * 0.1 +
    (hasVolume ? 0.05 : 0) +
    (repeatedSignals ? 0.08 : 0) +
    (countryMatched ? 0.04 : 0);

  const whyMatched = buildWhyMatched({
    roleRelevanceScore: roleScore,
    contactScore,
    sourceQuality,
    signalScore,
    hasVolume,
    countryMatch: countryMatched,
    productMatch: productMatched,
    repeatedSignals
  });
  const tier = classifyTier({
    confidenceScore: Number((confidence * 100).toFixed(2)),
    hasContact,
    hasCompany,
    signalScore
  });

  return {
    id: input.lead.id,
    leadId: input.lead.id,
    company: input.lead.company?.name || input.result?.company || "Unknown company",
    role,
    country,
    city: input.lead.company?.city || null,
    product: productName,
    volume,
    contactPerson,
    email,
    phone,
    telegram,
    whatsapp,
    website,
    sourceName,
    sourceUrl,
    confidenceScore: Number((confidence * 100).toFixed(2)),
    rankingScore: Number((Math.max(0.01, Math.min(0.99, ranking)) * 100).toFixed(2)),
    tier,
    whyMatched,
    hasContact,
    hasEmail,
    hasPhone,
    hasVolume,
    searchJobId: input.searchJobId,
    createdAt: input.lead.createdAt.toISOString()
  };
};

export const getLeadDatabaseSnapshot = async (jobId: string): Promise<LeadDatabaseSnapshot> => {
  const snapshot = await getSearchJobSnapshot(jobId);
  const sourceQualityMap = await getSourceQualityMap();
  const companySignalMap = buildCompanySignalMap(snapshot.results);

  const resultBySource = new Map<string, JobResultItem>();
  snapshot.results.forEach((result) => {
    const key = normalizeText(result.source_url).toLowerCase();
    if (!key) return;
    const existing = resultBySource.get(key);
    if (!existing || (result.relevance_score || result.confidence_score || 0) > (existing.relevance_score || existing.confidence_score || 0)) {
      resultBySource.set(key, result);
    }
  });

  const sourceUrls = Array.from(
    new Set(
      snapshot.results
        .map((item) => normalizeText(item.source_url))
        .filter(Boolean)
    )
  );
  const leadIds = Array.from(new Set(snapshot.results.map((item) => item.lead_id).filter((value): value is string => Boolean(value))));

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { id: { in: leadIds } },
        { sourceUrl: { in: sourceUrls } }
      ]
    },
    include: {
      product: true,
      company: {
        include: {
          contacts: {
            orderBy: { updatedAt: "desc" },
            take: 8
          }
        }
      },
      rawMarketLeads: {
        orderBy: { createdAt: "desc" },
        take: 5
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const allItems = dedupeItems(
    leads.map((lead) =>
      toLeadDatabaseItem({
        lead,
        result: resultBySource.get(normalizeText(lead.sourceUrl).toLowerCase()) || null,
        parsedIntent: snapshot.parsed_query.intent,
        targetCountry: snapshot.parsed_query.target_country_or_region,
        parsedProduct: snapshot.parsed_query.product,
        sourceQualityMap,
        companySignalMap,
        searchJobId: snapshot.job.id
      })
    )
  ).filter((item) => item.confidenceScore >= 56 && item.company !== "Unknown company");

  const items = allItems
    .filter((item) => item.tier === "ready" || item.tier === "actionable")
    .sort((a, b) => b.rankingScore - a.rankingScore || b.confidenceScore - a.confidenceScore)
    .slice(0, 400);

  const totalConfidence = items.reduce((acc, item) => acc + item.confidenceScore, 0);

  return {
    job: {
      id: snapshot.job.id,
      status: snapshot.job.status,
      query: snapshot.job.query,
      createdAt: snapshot.job.created_at,
      parsedIntent: snapshot.parsed_query.intent,
      targetCountry: snapshot.parsed_query.target_country_or_region
    },
    totals: {
      readyLeads: items.filter((item) => item.tier === "ready").length,
      actionableLeads: items.filter((item) => item.tier === "actionable").length,
      withContacts: items.filter((item) => item.hasContact).length,
      withVolume: items.filter((item) => item.hasVolume).length,
      averageConfidence: items.length > 0 ? Number((totalConfidence / items.length).toFixed(2)) : 0
    },
    leads: items
  };
};

export const listLeadDatabaseEntries = async (filters: LeadDatabaseListFilters): Promise<LeadDatabaseListResponse> => {
  const limit = Math.max(50, Math.min(filters.limit || 250, 600));
  const q = normalizeText(filters.q);
  const where: Prisma.LeadWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { rawText: { contains: q, mode: "insensitive" } },
            { sourceName: { contains: q, mode: "insensitive" } },
            { company: { is: { name: { contains: q, mode: "insensitive" } } } }
          ]
        }
      : {}),
    ...(filters.source ? { sourceName: { equals: filters.source, mode: "insensitive" } } : {}),
    ...(filters.country ? { destinationCountry: { contains: filters.country, mode: "insensitive" } } : {}),
    ...(filters.product ? { product: { is: { name: { contains: filters.product, mode: "insensitive" } } } } : {}),
    ...(filters.has_volume === true ? { volume: { not: null } } : {})
  };

  const leads = await prisma.lead.findMany({
    where,
    include: {
      product: true,
      company: {
        include: {
          contacts: {
            orderBy: { updatedAt: "desc" },
            take: 8
          }
        }
      },
      rawMarketLeads: {
        orderBy: { createdAt: "desc" },
        take: 3
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: limit
  });

  const sourceQualityMap = await getSourceQualityMap();

  const allItems = dedupeItems(
    leads.map((lead) => {
      const raw = lead.rawMarketLeads[0];
      const result = parseNormalizedResultFromRaw((raw?.normalized as Prisma.JsonValue) || null);
      return toLeadDatabaseItem({
        lead,
        result,
        parsedIntent: null,
        targetCountry: null,
        parsedProduct: null,
        sourceQualityMap,
        companySignalMap: new Map(),
        searchJobId: null
      });
    })
  );

  const items = allItems
    .filter((item) => item.tier === "ready" || item.tier === "actionable")
    .filter((item) => {
      if (filters.role && item.role !== filters.role) return false;
      if (filters.tier && item.tier !== filters.tier) return false;
      if (filters.has_contact === true && !item.hasContact) return false;
      if (filters.has_contact === false && item.hasContact) return false;
      if (filters.has_email === true && !item.hasEmail) return false;
      if (filters.has_email === false && item.hasEmail) return false;
      if (filters.has_phone === true && !item.hasPhone) return false;
      if (filters.has_phone === false && item.hasPhone) return false;
      if (typeof filters.confidence === "number" && item.confidenceScore < filters.confidence) return false;
      if (filters.country && !(item.country || "").toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (filters.product && !(item.product || "").toLowerCase().includes(filters.product.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.rankingScore - a.rankingScore || b.confidenceScore - a.confidenceScore)
    .slice(0, limit);

  const totalConfidence = items.reduce((acc, item) => acc + item.confidenceScore, 0);

  return {
    totals: {
      total: items.length,
      readyLeads: items.filter((item) => item.tier === "ready").length,
      actionableLeads: items.filter((item) => item.tier === "actionable").length,
      withContacts: items.filter((item) => item.hasContact).length,
      withVolume: items.filter((item) => item.hasVolume).length,
      averageConfidence: items.length > 0 ? Number((totalConfidence / items.length).toFixed(2)) : 0
    },
    leads: items
  };
};
