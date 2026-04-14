import type { LeadType } from "@prisma/client";
import { parseLeadText, summarizeLead, suggestNextActions } from "@/lib/ai";
import type { NormalizedMarketResult, ParsedQuery, MarketRole } from "./types";

const ANALYZE_LIMIT = Math.max(0, Math.min(Number(process.env.MARKET_AI_ANALYZE_LIMIT || 3), 10));
type TradingSignalType = "importer_signal" | "exporter_signal" | "recurring_buyer_signal";
type CompanySignalStats = { count: number; sourceCount: number };

const mapClassificationToLeadType = (classification: MarketRole): LeadType => {
  if (classification === "buyer" || classification === "importer") return "BUY";
  if (classification === "supplier" || classification === "exporter") return "SELL";
  return "INQUIRY";
};

const inferClassificationFromText = (result: NormalizedMarketResult) => {
  const text = `${result.result_type} ${result.raw_text} ${result.description}`.toLowerCase();

  if (/(importer|import|buy requirement|buyer|wanted|rfq)/.test(text)) return "buyer" as const;
  if (/(exporter|export|supplier|manufacturer|factory|offer available)/.test(text)) return "supplier" as const;
  if (/(trader|distributor|broker)/.test(text)) return "trader" as const;
  return "buyer" as const;
};

const mapLeadTypeToClassification = (leadType: LeadType): MarketRole => {
  if (leadType === "BUY") return "buyer";
  if (leadType === "SELL") return "supplier";
  return "trader";
};

const getCompanyKey = (result: NormalizedMarketResult) => {
  const value = (result.company || "").trim().toLowerCase();
  if (!value) return "";
  return value.replace(/\s+/g, " ");
};

const detectSignalType = (input: {
  result: NormalizedMarketResult;
  parsedQuery: ParsedQuery;
  classification: MarketRole;
  companyStats: CompanySignalStats;
}): TradingSignalType | null => {
  const text = `${input.result.result_type} ${input.result.raw_text} ${input.result.description}`.toLowerCase();
  const hasImporterSignal =
    input.parsedQuery.importer_intent ||
    input.parsedQuery.intent === "importers" ||
    /(importer|import requirement|destination|buy requirement|looking to import)/.test(text) ||
    input.classification === "importer";
  const hasExporterSignal =
    input.parsedQuery.exporter_intent ||
    input.parsedQuery.intent === "exporters" ||
    /(exporter|export offer|origin|fob|supplier offer)/.test(text) ||
    input.classification === "exporter";
  const recurringBuyerSignal =
    input.parsedQuery.recurring_buyer_intent ||
    input.companyStats.count >= 2 ||
    /(monthly|regular|repeat|recurring|long-term|ongoing)/.test(text);

  if (recurringBuyerSignal && hasImporterSignal) return "recurring_buyer_signal";
  if (hasImporterSignal) return "importer_signal";
  if (hasExporterSignal) return "exporter_signal";
  return null;
};

const computeRelevance = (
  result: NormalizedMarketResult,
  parsedQuery: ParsedQuery,
  classification: MarketRole,
  signalType: TradingSignalType | null,
  companyStats: CompanySignalStats
) => {
  const text = `${result.description} ${result.raw_text} ${result.company || ""}`.toLowerCase();

  const tokenMatches = parsedQuery.tokens.filter((token) => token.length > 1 && text.includes(token.toLowerCase())).length;
  const tokenScore = parsedQuery.tokens.length > 0 ? tokenMatches / parsedQuery.tokens.length : 0.5;

  const countryMatch = parsedQuery.target_country_or_region
    ? `${result.country || ""} ${result.destination || ""}`
        .toLowerCase()
        .includes(parsedQuery.target_country_or_region.toLowerCase())
      ? 0.2
      : 0
    : 0.1;

  const intentMatch =
    parsedQuery.intent === "buyers" || parsedQuery.intent === "importers" || parsedQuery.intent === "rfq"
      ? classification === "buyer" || classification === "importer"
      : parsedQuery.intent === "suppliers" || parsedQuery.intent === "manufacturers" || parsedQuery.intent === "exporters"
        ? classification === "supplier" || classification === "exporter"
        : true;

  const intentBonus = intentMatch ? 0.15 : -0.08;

  const confidence = typeof result.confidence_score === "number" ? result.confidence_score * 0.25 : 0;
  const hasContact = Boolean(result.contact_name);
  const hasCompany = Boolean(result.company && result.company.trim().length > 1);
  const multiSourceSignal = companyStats.sourceCount >= 2;
  const repeatedSignal = companyStats.count >= 2;

  let signalBonus = 0;
  if (signalType === "importer_signal") signalBonus += 0.09;
  if (signalType === "exporter_signal") signalBonus += 0.08;
  if (signalType === "recurring_buyer_signal") signalBonus += 0.14;
  if (repeatedSignal) signalBonus += 0.06;
  if (multiSourceSignal) signalBonus += 0.08;
  if (!hasCompany) signalBonus -= 0.1;
  if (!hasContact) signalBonus -= 0.05;
  if (result.result_type === "buyer_rfq" && !signalType) signalBonus -= 0.14;

  const score = 0.32 + tokenScore * 0.28 + countryMatch + intentBonus + confidence + signalBonus;
  return Number(Math.max(0.05, Math.min(0.99, score)).toFixed(2));
};

const enrichSingleResult = async (
  result: NormalizedMarketResult,
  parsedQuery: ParsedQuery,
  companyStatsMap: Map<string, CompanySignalStats>
) => {
  const baseClassification = inferClassificationFromText(result);
  const rawText = result.raw_text || result.description;
  const companyStats = companyStatsMap.get(getCompanyKey(result)) || { count: 0, sourceCount: 0 };

  try {
    const parsed = await parseLeadText(rawText);
    const classification = mapLeadTypeToClassification(parsed.leadType || mapClassificationToLeadType(baseClassification));
    const signalType = detectSignalType({
      result,
      parsedQuery,
      classification,
      companyStats
    });

    const summaryInput = {
      title: result.company || result.description,
      rawText,
      product: result.product || parsedQuery.product || undefined,
      leadType: parsed.leadType,
      volume: parsed.volume,
      unit: parsed.unit,
      price: parsed.price,
      currency: parsed.currency,
      incoterms: parsed.incoterms,
      originCountry: result.country,
      destinationCountry: result.destination
    };

    const [summary, nextActions] = await Promise.all([
      summarizeLead(summaryInput),
      suggestNextActions(summaryInput)
    ]);

    const relevance = computeRelevance(result, parsedQuery, classification, signalType, companyStats);

    return {
      ...result,
      result_type: signalType || result.result_type,
      ai_classification: classification,
      ai_summary: summary,
      relevance_score: relevance,
      next_action: nextActions[0] || undefined
    };
  } catch {
    const signalType = detectSignalType({
      result,
      parsedQuery,
      classification: baseClassification,
      companyStats
    });
    const relevance = computeRelevance(result, parsedQuery, baseClassification, signalType, companyStats);
    return {
      ...result,
      result_type: signalType || result.result_type,
      ai_classification: baseClassification,
      relevance_score: relevance,
      next_action: undefined
    };
  }
};

export const enrichResultsWithAi = async (
  results: NormalizedMarketResult[],
  parsedQuery: ParsedQuery
): Promise<NormalizedMarketResult[]> => {
  if (results.length === 0) return [];

  const ordered = [...results].sort((a, b) => b.confidence_score - a.confidence_score);
  const enriched: NormalizedMarketResult[] = [];
  const companySignals = new Map<string, { count: number; sources: Set<string> }>();

  ordered.forEach((item) => {
    const key = getCompanyKey(item);
    if (!key) return;
    const current = companySignals.get(key) || { count: 0, sources: new Set<string>() };
    current.count += 1;
    current.sources.add(item.source_name.toLowerCase());
    companySignals.set(key, current);
  });

  const companyStatsMap = new Map<string, CompanySignalStats>();
  companySignals.forEach((value, key) => {
    companyStatsMap.set(key, {
      count: value.count,
      sourceCount: value.sources.size
    });
  });

  for (let index = 0; index < ordered.length; index += 1) {
    const result = ordered[index];
    const companyStats = companyStatsMap.get(getCompanyKey(result)) || { count: 0, sourceCount: 0 };

    if (index >= ANALYZE_LIMIT) {
      const classification = inferClassificationFromText(result);
      const signalType = detectSignalType({
        result,
        parsedQuery,
        classification,
        companyStats
      });
      enriched.push({
        ...result,
        result_type: signalType || result.result_type,
        ai_classification: classification,
        relevance_score: computeRelevance(result, parsedQuery, classification, signalType, companyStats)
      });
      continue;
    }

    const analyzed = await enrichSingleResult(result, parsedQuery, companyStatsMap);
    enriched.push(analyzed);
  }

  return enriched.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
};
