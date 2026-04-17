import { LeadStatus, type LeadType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getSearchJobSnapshot } from "@/lib/services/market-intelligence";
import type { JobResultItem, SearchIntent } from "@/lib/services/market-intelligence";
import { getSourcePerformanceDashboardData } from "@/lib/services/source-performance";
import { SOURCE_CATALOG } from "@/lib/services/market-intelligence/source-catalog";

type DiscoveryRole = "buyer" | "supplier" | "importer" | "exporter" | "manufacturer" | "trader";
type DiscoveryStage = "strong" | "probable";
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
  discoveryStage: DiscoveryStage;
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
    probableCompanies: number;
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

const NON_COMPANY_PATTERN =
  /\b(news|blog|article|media|press|forum|wikipedia|reddit|quora|linkedin|facebook|instagram|youtube|x\.com|twitter)\b/i;
const COMPANY_HOST_BLOCKLIST = [
  "kompass.com",
  "europages.com",
  "alibaba.com",
  "tradekey.com",
  "tradewheel.com",
  "go4worldbusiness.com",
  "ec21.com",
  "exporthub.com",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "yahoo.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "reddit.com",
  "quora.com"
];
const COMPANY_NAME_PATTERN =
  /\b([a-z0-9][a-z0-9&.,'()\- ]{2,90}\s(?:llc|ltd|limited|inc|corp|co\.?|company|group|gmbh|sarl|fze|dmcc|pte|ag|bv|srl|trading|foods?|agro|imports?|exports?|distribution|distributors?|supplies?|enterprise|enterprises|holdings?))\b/i;

const cleanCompanyName = (value: string | null | undefined) => (value || "").trim().replace(/\s+/g, " ");

const isLikelyCompanyIdentity = (value: string | null | undefined) => {
  const normalized = cleanCompanyName(value);
  if (!normalized || normalized.length < 2) return false;
  if (/^(unknown|n\/a|na|none|null|anonymous)(\s|$)/i.test(normalized)) return false;
  if (NON_COMPANY_PATTERN.test(normalized)) return false;
  return true;
};

const toHost = (url: string | null | undefined) => {
  const source = (url || "").trim();
  if (!source) return "";
  try {
    return new URL(source).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
};

const inferCompanyFromHost = (url: string | null | undefined) => {
  const host = toHost(url);
  if (!host) return null;
  if (COMPANY_HOST_BLOCKLIST.some((entry) => host.includes(entry))) return null;
  const base = cleanCompanyName(host.split(".")[0]?.replace(/[-_]+/g, " ") || "");
  return isLikelyCompanyIdentity(base) ? base : null;
};

const inferCompanyFromText = (value: string | null | undefined) => {
  const text = (value || "").trim();
  if (!text) return null;
  const match = text.match(COMPANY_NAME_PATTERN);
  if (!match?.[1]) return null;
  const candidate = cleanCompanyName(match[1]);
  return isLikelyCompanyIdentity(candidate) ? candidate : null;
};

const resolveDiscoveryCompanyName = (payload: {
  company?: string | null;
  sourceUrl?: string | null;
  description?: string | null;
  rawText?: string | null;
}) => {
  const direct = cleanCompanyName(payload.company);
  if (isLikelyCompanyIdentity(direct)) return direct;
  const fromText = inferCompanyFromText(`${payload.description || ""}\n${payload.rawText || ""}`);
  if (fromText) return fromText;
  const fromHost = inferCompanyFromHost(payload.sourceUrl);
  if (fromHost) return fromHost;
  return null;
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
  const map = new Map<string, number>();
  try {
    const perf = await getSourcePerformanceDashboardData();
    perf.rows.forEach((row) => {
      const score =
        row.fetchSuccessRate * 0.25 +
        row.parseSuccessRate * 0.25 +
        row.successRate * 0.25 +
        row.importedLeadRate * 0.25;
      map.set(row.sourceName.toLowerCase(), Math.max(0.1, Math.min(1, score / 100)));
    });
  } catch {
    // Discovery should stay usable even if source performance metrics are temporarily unavailable.
  }
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

  const allResults = snapshot.results;
  const companySignalMap = new Map<string, { count: number; signalCount: number; sources: Set<string> }>();

  allResults.forEach((item) => {
    const key = normalizeCompanyKey(
      resolveDiscoveryCompanyName({
        company: item.company,
        sourceUrl: item.source_url,
        description: item.description,
        rawText: item.raw_text
      })
    );
    if (!key) return;
    const existing = companySignalMap.get(key) || { count: 0, signalCount: 0, sources: new Set<string>() };
    existing.count += 1;
    if (isTradingSignalResult(item)) existing.signalCount += 1;
    existing.sources.add(item.source_name.toLowerCase());
    companySignalMap.set(key, existing);
  });

  const leadIdSet = new Set(allResults.map((item) => item.lead_id).filter((value): value is string => Boolean(value)));
  const sourceUrlSet = new Set(allResults.map((item) => item.source_url).filter(Boolean));

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

  const discoveryLeads: LeadDiscoveryItem[] = allResults
    .map((result) => {
      const linkedLead = (result.lead_id && leadById.get(result.lead_id)) || leadBySourceUrl.get(result.source_url) || null;
      const firstContact = linkedLead?.company?.contacts.find((item) => Boolean(item.email || item.phone || item.fullName)) || null;

      const role = inferRole(result, linkedLead?.leadType);
      const confidence = Math.max(0.05, Math.min(0.99, result.relevance_score || result.confidence_score || 0.5));
      const sourceQuality = sourceQualityMap.get(result.source_name.toLowerCase()) || 0.4;
      const sourceGroup = sourceGroupByName.get(result.source_name.toLowerCase()) || "rfq_platforms";
      const resolvedCompanyName = resolveDiscoveryCompanyName({
        company: linkedLead?.company?.name || result.company,
        sourceUrl: result.source_url,
        description: result.description,
        rawText: result.raw_text
      });
      const companyKey = normalizeCompanyKey(resolvedCompanyName);
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
      const companyName = resolvedCompanyName || linkedLead?.company?.name || result.company;
      const hasCompanyIdentity = isLikelyCompanyIdentity(companyName);
      const hasContactData = Boolean(firstContact?.email || firstContact?.phone || firstContact?.fullName || result.contact_name);

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
      const countryMatched = Boolean(
        parsed.target_country_or_region && countryText.includes(parsed.target_country_or_region.toLowerCase())
      );
      const productText = `${result.product || ""} ${result.description || ""}`.toLowerCase();
      const productMatched = Boolean(parsed.product && productText.includes(parsed.product.toLowerCase()));
      const promotedByPipeline = result.persistence_status === "imported" || result.persistence_status === "duplicate";
      const strongCandidate =
        hasCompanyIdentity &&
        !rfqOnly &&
        (promotedByPipeline ||
          (confidence >= 0.62 &&
            (hasTradingSignal ||
              repeatedSignals ||
              multiSource ||
              roleRelevance >= 0.68 ||
              enrichmentScore >= 0.22 ||
              countryMatched)));

      const probableCandidate =
        !strongCandidate &&
        hasCompanyIdentity &&
        (confidence >= 0.2 ||
          sourceQuality >= 0.2 ||
          roleRelevance >= 0.35 ||
          countryMatched ||
          productMatched ||
          enrichmentScore >= 0.08 ||
          hasTradingSignal ||
          repeatedSignals ||
          multiSource ||
          result.persistence_status === "staged" ||
          result.persistence_status === "logged");

      if (!strongCandidate && !probableCandidate) return null;

      return {
        id: result.id,
        discoveryStage: strongCandidate ? "strong" : "probable",
        leadId: linkedLead?.id || result.lead_id || null,
        dealId: linkedLead?.sourceDeal?.id || null,
        company: companyName || "Unknown company",
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

  discoveryLeads.sort((a, b) => {
    const stageDelta = (b.discoveryStage === "strong" ? 1 : 0) - (a.discoveryStage === "strong" ? 1 : 0);
    if (stageDelta !== 0) return stageDelta;
    return b.rankingScore - a.rankingScore || b.confidenceScore - a.confidenceScore;
  });

  const readyLeadsCount = discoveryLeads.filter((item) => item.discoveryStage === "strong").length;
  const probableCompaniesCount = discoveryLeads.filter((item) => item.discoveryStage === "probable").length;

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
      readyLeads: readyLeadsCount,
      probableCompanies: probableCompaniesCount,
      hiddenReview: snapshot.results.filter((item) => item.persistence_status === "staged").length,
      lowConfidence: snapshot.results.filter((item) => item.persistence_status === "logged").length,
      imported: snapshot.results.filter((item) => item.persistence_status === "imported").length,
      duplicates: snapshot.results.filter((item) => item.persistence_status === "duplicate").length
    },
    leads: discoveryLeads
  };
};
