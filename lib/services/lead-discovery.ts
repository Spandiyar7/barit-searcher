import { LeadStatus, type LeadType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSearchJobSnapshot } from "@/lib/services/market-intelligence";
import type { JobResultItem, SearchIntent } from "@/lib/services/market-intelligence";
import { getSourcePerformanceDashboardData } from "@/lib/services/source-performance";
import { SOURCE_CATALOG } from "@/lib/services/market-intelligence/source-catalog";

type DiscoveryRole = "buyer" | "supplier" | "importer" | "exporter" | "manufacturer" | "trader";
type WhyMatchedCode =
  | "roleMatch"
  | "countryMatch"
  | "productMatch"
  | "enrichment"
  | "sourceQuality"
  | "confidence"
  | "repeatedSignals"
  | "multiSource";

export type LeadDiscoveryItem = {
  id: string;
  leadId: string | null;
  dealId: string | null;
  company: string;
  country: string | null;
  role: DiscoveryRole;
  product: string | null;
  confidenceScore: number;
  rankingScore: number;
  sourceName: string;
  sourceUrl: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  aiExplanation: string;
  nextAction: string;
  whyMatched: WhyMatchedCode[];
  status: LeadStatus | "UNSAVED";
  createdAt: string;
  rawResult: JobResultItem;
};

export type LeadDiscoverySnapshot = {
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
    hiddenReview: number;
    lowConfidence: number;
    imported: number;
    duplicates: number;
  };
  leads: LeadDiscoveryItem[];
};

const toRoleFromLeadType = (leadType: LeadType): DiscoveryRole => {
  if (leadType === "BUY") return "buyer";
  if (leadType === "SELL") return "supplier";
  return "trader";
};

const inferRole = (result: JobResultItem, leadType?: LeadType): DiscoveryRole => {
  const base = (result.ai_classification || "").toLowerCase();
  const text = `${result.result_type || ""} ${result.description || ""}`.toLowerCase();

  if (/manufacturer|factory|mill|producer/.test(text)) return "manufacturer";
  if (base === "buyer") return "buyer";
  if (base === "supplier") return "supplier";
  if (base === "importer") return "importer";
  if (base === "exporter") return "exporter";
  if (leadType) return toRoleFromLeadType(leadType);
  return "trader";
};

const getRoleRelevance = (intent: SearchIntent, role: DiscoveryRole) => {
  if (intent === "buyers" || intent === "importers" || intent === "rfq") {
    if (role === "buyer" || role === "importer") return 1;
    if (role === "trader") return 0.6;
    return 0.3;
  }

  if (intent === "suppliers" || intent === "manufacturers" || intent === "exporters") {
    if (role === "supplier" || role === "manufacturer" || role === "exporter") return 1;
    if (role === "trader") return 0.6;
    return 0.3;
  }

  if (intent === "deals") return 0.7;
  return 0.5;
};

const normalizeCompanyKey = (value: string | null | undefined) => {
  const normalized = (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "unknown company") return "";
  return normalized;
};

const isTradingSignalResult = (result: JobResultItem) => {
  const lowered = (result.result_type || "").toLowerCase();
  return (
    lowered.includes("importer_signal") ||
    lowered.includes("exporter_signal") ||
    lowered.includes("recurring_buyer_signal")
  );
};

const isRfQOnlyResult = (result: JobResultItem) => {
  const lowered = (result.result_type || "").toLowerCase();
  const rfqLike = lowered.includes("rfq") || lowered.includes("buyer_rfq");
  return rfqLike && !isTradingSignalResult(result);
};

const parsePostedDate = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getFreshnessScore = (createdAt: Date) => {
  const days = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 3) return 1;
  if (days <= 14) return 0.8;
  if (days <= 30) return 0.6;
  if (days <= 60) return 0.35;
  return 0.2;
};

const buildAiExplanation = (result: JobResultItem, role: DiscoveryRole) => {
  if (result.ai_summary) return result.ai_summary;
  const product = result.product || "commodity";
  const location = result.country || result.destination || "target market";
  return `Detected ${role} intent for ${product} with relevant market signal in ${location}.`;
};

const buildNextAction = (result: JobResultItem, role: DiscoveryRole) => {
  if (result.next_action) return result.next_action;
  if (role === "buyer" || role === "importer") return "Validate demand volume and send matching supplier shortlist.";
  if (role === "supplier" || role === "manufacturer" || role === "exporter") {
    return "Request current offer terms and align with active buyer requirements.";
  }
  return "Run qualification call and capture firm requirements for deal matching.";
};

const getSourceQualityMap = async () => {
  const perf = await getSourcePerformanceDashboardData();
  const map = new Map<string, number>();
  perf.rows.forEach((row) => {
    const score =
      row.fetchSuccessRate * 0.25 +
      row.parseSuccessRate * 0.25 +
      row.successRate * 0.25 +
      row.importedLeadRate * 0.25;
    map.set(row.sourceName.toLowerCase(), Math.max(0.1, Math.min(1, score / 100)));
  });
  return map;
};

const getEnrichmentScore = (payload: {
  hasCompany: boolean;
  hasWebsite: boolean;
  hasDescription: boolean;
  hasContactName: boolean;
  hasContactEmail: boolean;
  hasContactPhone: boolean;
}) => {
  let score = 0;
  if (payload.hasCompany) score += 0.2;
  if (payload.hasWebsite) score += 0.2;
  if (payload.hasDescription) score += 0.15;
  if (payload.hasContactName) score += 0.15;
  if (payload.hasContactEmail) score += 0.15;
  if (payload.hasContactPhone) score += 0.15;
  return Math.max(0, Math.min(1, score));
};

const getWhyMatched = (payload: {
  roleRelevance: number;
  countryMatched: boolean;
  productMatched: boolean;
  enrichmentScore: number;
  sourceQuality: number;
  confidence: number;
  repeatedSignals: boolean;
  multiSource: boolean;
}): WhyMatchedCode[] => {
  const reasons: WhyMatchedCode[] = [];
  if (payload.roleRelevance >= 0.8) reasons.push("roleMatch");
  if (payload.countryMatched) reasons.push("countryMatch");
  if (payload.productMatched) reasons.push("productMatch");
  if (payload.enrichmentScore >= 0.55) reasons.push("enrichment");
  if (payload.sourceQuality >= 0.65) reasons.push("sourceQuality");
  if (payload.confidence >= 0.7) reasons.push("confidence");
  if (payload.repeatedSignals) reasons.push("repeatedSignals");
  if (payload.multiSource) reasons.push("multiSource");
  return reasons.slice(0, 5);
};

export const getLeadDiscoverySnapshot = async (jobId: string): Promise<LeadDiscoverySnapshot> => {
  const snapshot = await getSearchJobSnapshot(jobId);
  const sourceQualityMap = await getSourceQualityMap();
  const sourceGroupByName = new Map(
    SOURCE_CATALOG.map((item) => [item.name.toLowerCase(), item.group])
  );

  const readyResults = snapshot.results.filter(
    (item) => item.persistence_status === "imported" || item.persistence_status === "duplicate"
  );
  const companySignalMap = new Map<string, { count: number; signalCount: number; sources: Set<string> }>();

  snapshot.results.forEach((item) => {
    const key = normalizeCompanyKey(item.company);
    if (!key) return;
    const existing = companySignalMap.get(key) || { count: 0, signalCount: 0, sources: new Set<string>() };
    existing.count += 1;
    if (isTradingSignalResult(item)) existing.signalCount += 1;
    existing.sources.add(item.source_name.toLowerCase());
    companySignalMap.set(key, existing);
  });

  const leadIdSet = new Set(readyResults.map((item) => item.lead_id).filter((value): value is string => Boolean(value)));
  const sourceUrlSet = new Set(readyResults.map((item) => item.source_url).filter(Boolean));

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { id: { in: Array.from(leadIdSet) } },
        { sourceUrl: { in: Array.from(sourceUrlSet) } }
      ]
    },
    include: {
      product: true,
      sourceDeal: { select: { id: true } },
      company: {
        include: {
          contacts: {
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      }
    }
  });

  const leadById = new Map(leads.map((lead) => [lead.id, lead]));
  const leadBySourceUrl = new Map(leads.map((lead) => [lead.sourceUrl || "", lead]));

  const parsed = snapshot.parsed_query;

  const discoveryLeads: LeadDiscoveryItem[] = readyResults
    .map((result) => {
    const linkedLead = (result.lead_id && leadById.get(result.lead_id)) || leadBySourceUrl.get(result.source_url) || null;
    const firstContact = linkedLead?.company?.contacts.find((item) => Boolean(item.email || item.phone || item.fullName)) || null;

    const role = inferRole(result, linkedLead?.leadType);
    const confidence = Math.max(0.05, Math.min(0.99, result.relevance_score || result.confidence_score || 0.5));
    const sourceQuality = sourceQualityMap.get(result.source_name.toLowerCase()) || 0.4;
    const sourceGroup = sourceGroupByName.get(result.source_name.toLowerCase()) || "rfq_platforms";
    const companyKey = normalizeCompanyKey(linkedLead?.company?.name || result.company);
    const companySignals = companySignalMap.get(companyKey) || { count: 0, signalCount: 0, sources: new Set<string>() };
    const hasTradingSignal = isTradingSignalResult(result) || companySignals.signalCount > 0;
    const rfqOnly = isRfQOnlyResult(result) && sourceGroup === "rfq_platforms";
    const repeatedSignals = companySignals.count >= 2;
    const multiSource = companySignals.sources.size >= 2;

    const enrichmentScore = getEnrichmentScore({
      hasCompany: Boolean(linkedLead?.company?.name || result.company),
      hasWebsite: Boolean(linkedLead?.company?.website),
      hasDescription: Boolean(linkedLead?.company?.description),
      hasContactName: Boolean(firstContact?.fullName || result.contact_name),
      hasContactEmail: Boolean(firstContact?.email),
      hasContactPhone: Boolean(firstContact?.phone)
    });

    const freshnessDate = parsePostedDate(result.posted_date) || linkedLead?.publishedAt || linkedLead?.createdAt || new Date();
    const freshness = getFreshnessScore(freshnessDate);
    const roleRelevance = getRoleRelevance(parsed.intent, role);
    const hasCompanyIdentity = Boolean(companyKey);
    const hasContactData = Boolean(firstContact?.email || firstContact?.phone || result.contact_name);

    const ranking =
      confidence * 0.34 +
      sourceQuality * 0.17 +
      enrichmentScore * 0.18 +
      freshness * 0.1 +
      roleRelevance * 0.1 +
      (hasTradingSignal ? 0.14 : 0) +
      (repeatedSignals ? 0.07 : 0) +
      (multiSource ? 0.07 : 0) -
      (rfqOnly ? 0.16 : 0) -
      (hasCompanyIdentity ? 0 : 0.09) -
      (hasContactData ? 0 : 0.07);

    const countryText = `${result.country || ""} ${result.destination || ""}`.toLowerCase();
    const countryMatched = Boolean(parsed.target_country_or_region && countryText.includes(parsed.target_country_or_region.toLowerCase()));
    const productText = `${result.product || ""} ${result.description || ""}`.toLowerCase();
    const productMatched = Boolean(parsed.product && productText.includes(parsed.product.toLowerCase()));
    const qualityPassed =
      confidence >= 0.62 &&
      sourceQuality >= 0.35 &&
      !rfqOnly &&
      hasCompanyIdentity &&
      (hasTradingSignal || repeatedSignals || multiSource || roleRelevance >= 0.8) &&
      (enrichmentScore >= 0.28 || hasContactData);

    if (!qualityPassed) return null;

    return {
      id: result.id,
      leadId: linkedLead?.id || result.lead_id || null,
      dealId: linkedLead?.sourceDeal?.id || null,
      company: linkedLead?.company?.name || result.company || "Unknown company",
      country: linkedLead?.originCountry || result.country || result.destination || null,
      role,
      product: linkedLead?.product?.name || result.product || parsed.product || null,
      confidenceScore: Number((confidence * 100).toFixed(2)),
      rankingScore: Number((Math.max(0.01, Math.min(0.99, ranking)) * 100).toFixed(2)),
      sourceName: result.source_name,
      sourceUrl: result.source_url,
      contactName: firstContact?.fullName || result.contact_name || null,
      contactEmail: firstContact?.email || null,
      contactPhone: firstContact?.phone || null,
      aiExplanation: buildAiExplanation(result, role),
      nextAction: buildNextAction(result, role),
      whyMatched: getWhyMatched({
        roleRelevance,
        countryMatched,
        productMatched,
        enrichmentScore,
        sourceQuality,
        confidence,
        repeatedSignals,
        multiSource
      }),
      status: linkedLead?.status || "UNSAVED",
      createdAt: freshnessDate.toISOString(),
      rawResult: result
    };
  })
  .filter((item): item is LeadDiscoveryItem => Boolean(item));

  discoveryLeads.sort((a, b) => b.rankingScore - a.rankingScore || b.confidenceScore - a.confidenceScore);

  return {
    job: {
      id: snapshot.job.id,
      status: snapshot.job.status,
      query: snapshot.job.query,
      createdAt: snapshot.job.created_at,
      parsedIntent: parsed.intent,
      targetCountry: parsed.target_country_or_region
    },
    totals: {
      readyLeads: discoveryLeads.length,
      hiddenReview: snapshot.results.filter((item) => item.persistence_status === "staged").length,
      lowConfidence: snapshot.results.filter((item) => item.persistence_status === "logged").length,
      imported: snapshot.results.filter((item) => item.persistence_status === "imported").length,
      duplicates: snapshot.results.filter((item) => item.persistence_status === "duplicate").length
    },
    leads: discoveryLeads
  };
};
