import { prisma } from "@/lib/db/prisma";
import { getSearchJobSnapshot } from "@/lib/services/market-intelligence";
import type { JobResultItem, SearchIntent } from "@/lib/services/market-intelligence";

type TradeRole = "importer" | "exporter" | "buyer" | "supplier" | "manufacturer" | "trader";
type TradeSignalType = "importer_signal" | "exporter_signal" | "recurring_buyer_signal";

export type TradeIntelligenceItem = {
  id: string;
  leadId: string | null;
  company: string;
  country: string | null;
  role: TradeRole;
  product: string | null;
  confidenceScore: number;
  explanation: string;
  sourceName: string;
  sourceUrl: string;
  signalType: TradeSignalType;
  repeatedSignals: boolean;
  multiSource: boolean;
};

export type TradeIntelligenceSnapshot = {
  job: {
    id: string;
    status: string;
    query: string;
    createdAt: string;
    parsedIntent: SearchIntent;
    targetCountry: string | null;
  };
  totals: {
    companies: number;
    signals: number;
    repeatedCompanies: number;
    multiSourceCompanies: number;
  };
  items: TradeIntelligenceItem[];
};

const normalizeCompanyKey = (value: string | null | undefined) => {
  const normalized = (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized === "unknown company") return "";
  return normalized;
};

const inferRole = (result: JobResultItem): TradeRole => {
  const classification = (result.ai_classification || "").toLowerCase();
  const text = `${result.result_type || ""} ${result.description || ""}`.toLowerCase();

  if (/manufacturer|factory|mill|producer/.test(text)) return "manufacturer";
  if (classification === "importer") return "importer";
  if (classification === "exporter") return "exporter";
  if (classification === "buyer") return "buyer";
  if (classification === "supplier") return "supplier";
  if (/import/.test(text)) return "importer";
  if (/export/.test(text)) return "exporter";
  if (/buyer|requirement|rfq/.test(text)) return "buyer";
  if (/supplier|offer|seller/.test(text)) return "supplier";
  return "trader";
};

const inferSignalType = (result: JobResultItem, defaultIntent: SearchIntent): TradeSignalType | null => {
  const loweredType = (result.result_type || "").toLowerCase();
  const text = `${result.result_type || ""} ${result.raw_text || ""} ${result.description || ""}`.toLowerCase();

  if (loweredType.includes("recurring_buyer_signal")) return "recurring_buyer_signal";
  if (loweredType.includes("importer_signal")) return "importer_signal";
  if (loweredType.includes("exporter_signal")) return "exporter_signal";
  if (/(recurring|monthly|repeat|ongoing|long-term)/.test(text) && /(buyer|import)/.test(text)) {
    return "recurring_buyer_signal";
  }
  if (/(importer|import|destination)/.test(text)) return "importer_signal";
  if (/(exporter|export|origin|fob|exw)/.test(text)) return "exporter_signal";
  if (defaultIntent === "importers" || defaultIntent === "buyers") return "importer_signal";
  if (defaultIntent === "exporters" || defaultIntent === "suppliers" || defaultIntent === "manufacturers") {
    return "exporter_signal";
  }
  return null;
};

const scoreSignal = (payload: {
  result: JobResultItem;
  signalType: TradeSignalType;
  repeatedSignals: boolean;
  multiSource: boolean;
  hasContact: boolean;
}) => {
  let score = payload.result.relevance_score ?? payload.result.confidence_score ?? 0.5;
  if (payload.signalType === "importer_signal") score += 0.08;
  if (payload.signalType === "exporter_signal") score += 0.07;
  if (payload.signalType === "recurring_buyer_signal") score += 0.12;
  if (payload.repeatedSignals) score += 0.09;
  if (payload.multiSource) score += 0.08;
  if (!payload.hasContact) score -= 0.06;
  if (!payload.result.company || payload.result.company.trim().length < 2) score -= 0.1;
  if ((payload.result.result_type || "").toLowerCase().includes("buyer_rfq") && payload.signalType !== "recurring_buyer_signal") {
    score -= 0.12;
  }
  return Number(Math.max(0.05, Math.min(0.99, score)).toFixed(3));
};

export const getTradeIntelligenceSnapshot = async (jobId: string): Promise<TradeIntelligenceSnapshot> => {
  const snapshot = await getSearchJobSnapshot(jobId);
  const parsed = snapshot.parsed_query;

  const candidateResults = snapshot.results.filter(
    (item) =>
      item.persistence_status === "imported" ||
      item.persistence_status === "duplicate" ||
      item.persistence_status === "staged"
  );

  const companySignals = new Map<string, { count: number; sources: Set<string> }>();
  candidateResults.forEach((item) => {
    const key = normalizeCompanyKey(item.company);
    if (!key) return;
    const current = companySignals.get(key) || { count: 0, sources: new Set<string>() };
    current.count += 1;
    current.sources.add(item.source_name.toLowerCase());
    companySignals.set(key, current);
  });

  const sourceUrls = Array.from(new Set(candidateResults.map((item) => item.source_url).filter(Boolean)));
  const leads = await prisma.lead.findMany({
    where: {
      sourceUrl: {
        in: sourceUrls
      }
    },
    select: {
      id: true,
      sourceUrl: true
    }
  });
  const leadBySourceUrl = new Map(leads.map((item) => [item.sourceUrl || "", item.id]));

  const mergedByCompany = new Map<
    string,
    {
      company: string;
      country: string | null;
      role: TradeRole;
      product: string | null;
      confidenceScore: number;
      explanationParts: Set<string>;
      sourceNames: Set<string>;
      sourceUrls: string[];
      signalType: TradeSignalType;
      leadId: string | null;
      repeatedSignals: boolean;
      multiSource: boolean;
    }
  >();

  for (const result of candidateResults) {
    const key = normalizeCompanyKey(result.company);
    if (!key) continue;

    const signalType = inferSignalType(result, parsed.intent);
    if (!signalType) continue;

    const signalStats = companySignals.get(key) || { count: 0, sources: new Set<string>() };
    const repeatedSignals = signalStats.count >= 2;
    const multiSource = signalStats.sources.size >= 2;
    const hasContact = Boolean(result.contact_name);
    const scored = scoreSignal({
      result,
      signalType,
      repeatedSignals,
      multiSource,
      hasContact
    });

    if (scored < 0.65) continue;

    const explanationParts = new Set<string>();
    if (signalType === "importer_signal") explanationParts.add("Importer behavior detected");
    if (signalType === "exporter_signal") explanationParts.add("Exporter behavior detected");
    if (signalType === "recurring_buyer_signal") explanationParts.add("Recurring buyer signal detected");
    if (repeatedSignals) explanationParts.add("Repeated signals found");
    if (multiSource) explanationParts.add("Company appears in multiple sources");
    if (result.country && parsed.target_country_or_region && result.country.toLowerCase().includes(parsed.target_country_or_region.toLowerCase())) {
      explanationParts.add("Target country matched");
    }

    const current = mergedByCompany.get(key);
    if (!current) {
      mergedByCompany.set(key, {
        company: result.company || "Unknown company",
        country: result.country || result.destination || null,
        role: inferRole(result),
        product: result.product || parsed.product || null,
        confidenceScore: scored,
        explanationParts,
        sourceNames: new Set([result.source_name]),
        sourceUrls: [result.source_url],
        signalType,
        leadId: leadBySourceUrl.get(result.source_url) || result.lead_id || null,
        repeatedSignals,
        multiSource
      });
      continue;
    }

    if (scored > current.confidenceScore) {
      current.confidenceScore = scored;
      current.role = inferRole(result);
      current.signalType = signalType;
      current.country = current.country || result.country || result.destination || null;
      current.product = current.product || result.product || parsed.product || null;
      current.leadId = current.leadId || leadBySourceUrl.get(result.source_url) || result.lead_id || null;
    }

    explanationParts.forEach((part) => current.explanationParts.add(part));
    current.sourceNames.add(result.source_name);
    if (!current.sourceUrls.includes(result.source_url)) current.sourceUrls.push(result.source_url);
    current.repeatedSignals = current.repeatedSignals || repeatedSignals;
    current.multiSource = current.multiSource || multiSource;
  }

  const items: TradeIntelligenceItem[] = Array.from(mergedByCompany.entries())
    .map(([key, item]) => ({
      id: key,
      leadId: item.leadId,
      company: item.company,
      country: item.country,
      role: item.role,
      product: item.product,
      confidenceScore: Number((item.confidenceScore * 100).toFixed(2)),
      explanation: Array.from(item.explanationParts).join(". "),
      sourceName: Array.from(item.sourceNames)[0] || "-",
      sourceUrl: item.sourceUrls[0] || "",
      signalType: item.signalType,
      repeatedSignals: item.repeatedSignals,
      multiSource: item.multiSource
    }))
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, 200);

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
      companies: items.length,
      signals: items.length,
      repeatedCompanies: items.filter((item) => item.repeatedSignals).length,
      multiSourceCompanies: items.filter((item) => item.multiSource).length
    },
    items
  };
};

