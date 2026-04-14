import OpenAI from "openai";
import { prisma } from "@/lib/db/prisma";
import { getRankingRunPerformanceMap } from "@/lib/services/source-performance";
import { SOURCE_CATALOG } from "./source-catalog";
import type {
  ParsedQuery,
  ProductCategory,
  SearchIntent,
  SourceDescriptor,
  SourceGroup,
  SourceId,
  SourceRecommendation
} from "./types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const OPENAI_ENABLED =
  (process.env.AI_PROVIDER || "openai").toLowerCase() === "openai" &&
  Boolean(process.env.OPENAI_API_KEY);

const openai = OPENAI_ENABLED ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const FALLBACK_SOURCE_IDS = new Set<SourceId>(["alibaba", "tradekey"]);
const TIER1_SOURCE_IDS = new Set<SourceId>([
  "petrochemz",
  "global_trade_plaza",
  "plastic4trade",
  "globy",
  "chemnet",
  "toocle",
  "ec21",
  "exporthub"
]);

const SPECIALIZED_CATEGORIES = new Set<ProductCategory>([
  "petrochemicals",
  "fuels",
  "lng_lpg",
  "polymers",
  "plastics",
  "chemicals",
  "fertilizers",
  "industrial_minerals"
]);

const QUERY_SOURCE_BOOST_RULES: Array<{
  pattern: RegExp;
  boosts: Partial<Record<SourceId, number>>;
}> = [
  {
    pattern: /polypropylene|polyethylene|hdpe|ldpe|lldpe/i,
    boosts: {
      plastic4trade: 30,
      petrochemz: 16,
      chemnet: 14,
      global_trade_plaza: 10
    }
  },
  {
    pattern: /\blpg\b|\blng\b|propane|butane/i,
    boosts: {
      petrochemz: 20,
      globy: 16,
      argus_media: 14,
      spglobal_platts: 14
    }
  },
  {
    pattern: /sulfur|sulphur/i,
    boosts: {
      chemnet: 22,
      petrochemz: 16,
      global_trade_plaza: 10,
      argus_media: 8
    }
  },
  {
    pattern: /petrochemical/i,
    boosts: {
      petrochemz: 24,
      chemnet: 18,
      globy: 12,
      global_trade_plaza: 10
    }
  },
  {
    pattern: /buyers?\s+europe|europe/i,
    boosts: {
      globy: 10,
      global_trade_plaza: 8,
      europages: 8
    }
  }
];

const INTENT_GROUP_SCORES: Record<SearchIntent, Record<SourceGroup, number>> = {
  buyers: {
    rfq_platforms: 20,
    supplier_platforms: 28,
    directories: 32,
    analytics: 28,
    direct_websites: 20
  },
  suppliers: {
    rfq_platforms: 18,
    supplier_platforms: 46,
    directories: 26,
    analytics: 12,
    direct_websites: 20
  },
  manufacturers: {
    rfq_platforms: 16,
    supplier_platforms: 50,
    directories: 28,
    analytics: 10,
    direct_websites: 22
  },
  importers: {
    rfq_platforms: 10,
    supplier_platforms: 24,
    directories: 34,
    analytics: 56,
    direct_websites: 24
  },
  exporters: {
    rfq_platforms: 12,
    supplier_platforms: 36,
    directories: 24,
    analytics: 52,
    direct_websites: 24
  },
  rfq: {
    rfq_platforms: 42,
    supplier_platforms: 22,
    directories: 16,
    analytics: 10,
    direct_websites: 12
  },
  deals: {
    rfq_platforms: 22,
    supplier_platforms: 26,
    directories: 16,
    analytics: 56,
    direct_websites: 14
  }
};

const RESULT_TYPE_GROUP_BOOST: Record<string, Partial<Record<SourceGroup, number>>> = {
  buyer_leads: { rfq_platforms: 3, directories: 10, supplier_platforms: 8 },
  supplier_profiles: { supplier_platforms: 14, directories: 10 },
  company_directory: { directories: 14, supplier_platforms: 8, direct_websites: 10 },
  trade_analytics: { analytics: 18, directories: 4 },
  mixed: { rfq_platforms: 4, supplier_platforms: 6, directories: 6, analytics: 6 }
};

const extractJson = <T>(value: string): T | null => {
  const match = value.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

type AIRank = { id: SourceId; score: number; reason: string };
type SourcePerf = {
  sourceId: string;
  totalRuns: number;
  successCount: number;
  blockedCount: number;
  averageExtracted: number;
  averageRelevance: number;
};

type RunPerf = {
  totalRuns: number;
  successRuns: number;
  blockedRuns: number;
  emptyRuns: number;
  totalExtracted: number;
  totalImported: number;
  totalRaw: number;
  averageExtracted: number;
  averageImported: number;
  averageRaw: number;
  successRate: number;
  blockedRate: number;
};

const getAIRerank = async (
  parsedQuery: ParsedQuery,
  candidates: SourceRecommendation[]
): Promise<Partial<Record<SourceId, AIRank>>> => {
  if (!openai || candidates.length === 0) return {};

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Rank source candidates for commodity market intelligence. Respect source tier and specialization. Return JSON array only with objects: {id, score, reason}. score is 0..100."
        },
        {
          role: "user",
          content: JSON.stringify({
            parsedQuery,
            candidates: candidates.map((source) => ({
              id: source.source_id,
              name: source.source_name,
              tier: source.priority_tier,
              purpose: source.purpose,
              group: source.group,
              product_category_fit: source.product_category_fit,
              industry_specialization: source.industry_specialization,
              execution_mode: source.execution_mode,
              anti_bot_risk: source.anti_bot_risk,
              reliability_score: source.reliability_score,
              engine_available: source.engine_available,
              initial_score: source.score,
              reason: source.reason
            }))
          })
        }
      ]
    });

    const parsed = extractJson<AIRank[]>(completion.choices[0]?.message?.content ?? "");
    if (!parsed || !Array.isArray(parsed)) return {};

    const rankedMap: Partial<Record<SourceId, AIRank>> = {};
    parsed.forEach((item) => {
      if (!item || typeof item !== "object") return;
      if (!item.id || typeof item.id !== "string") return;
      const sourceId = item.id as SourceId;
      if (!candidates.find((candidate) => candidate.source_id === sourceId)) return;
      const score = Number(item.score);
      rankedMap[sourceId] = {
        id: sourceId,
        score: Number.isFinite(score) ? Math.max(0, Math.min(score, 100)) : 0,
        reason: typeof item.reason === "string" ? item.reason.trim() : ""
      };
    });

    return rankedMap;
  } catch {
    return {};
  }
};

const loadPerformanceMap = async (intent: SearchIntent) => {
  try {
    const rows = await prisma.sourcePerformance.findMany({
      where: {
        OR: [{ intent }, { intent: "any" }]
      },
      select: {
        intent: true,
        sourceId: true,
        totalRuns: true,
        successCount: true,
        blockedCount: true,
        averageExtracted: true,
        averageRelevance: true
      }
    });

    const map = new Map<string, SourcePerf>();
    rows.forEach((row) => {
      const current = map.get(row.sourceId);
      if (!current || row.intent === intent) {
        map.set(row.sourceId, row);
      }
    });
    return map;
  } catch {
    return new Map<string, SourcePerf>();
  }
};

const getPerformanceAdjustment = (perf?: SourcePerf) => {
  if (!perf || perf.totalRuns < 2) return { delta: 0, reason: "" };

  const successRate = perf.successCount / Math.max(perf.totalRuns, 1);
  const blockedRate = perf.blockedCount / Math.max(perf.totalRuns, 1);

  let delta = 0;
  delta += Math.round((successRate - 0.5) * 16);
  delta -= Math.round(blockedRate * 14);
  delta += Math.round(Math.min(perf.averageExtracted, 6));
  delta += Math.round((perf.averageRelevance - 0.45) * 14);

  return {
    delta,
    reason: `Historical success ${Math.round(successRate * 100)}%`
  };
};

const getRunPerformanceAdjustment = (perf?: RunPerf) => {
  if (!perf || perf.totalRuns < 2) return { delta: 0, reason: "" };

  let delta = 0;
  delta += Math.round((perf.successRate - 0.4) * 30);
  delta -= Math.round(perf.blockedRate * 40);
  delta += Math.round(Math.min(perf.averageImported * 15, 18));
  delta += Math.round(Math.min(perf.averageRaw * 6, 10));
  delta += Math.round(Math.min(perf.averageExtracted, 8) / 2);

  if (perf.blockedRate >= 0.6 && perf.averageImported === 0) delta -= 10;
  if (perf.averageImported >= 1) delta += 4;

  return {
    delta,
    reason: `Imported avg ${perf.averageImported.toFixed(2)}`
  };
};

const isSpecializedCommodityQuery = (parsedQuery: ParsedQuery) =>
  Boolean(parsedQuery.product_category && SPECIALIZED_CATEGORIES.has(parsedQuery.product_category));

const scoreSource = (source: SourceDescriptor, parsedQuery: ParsedQuery, perf?: SourcePerf, runPerf?: RunPerf) => {
  let score = INTENT_GROUP_SCORES[parsedQuery.intent][source.group];
  const reasons: string[] = [];
  const specializedQuery = isSpecializedCommodityQuery(parsedQuery);
  const importerLikeIntent =
    parsedQuery.intent === "importers" ||
    parsedQuery.intent === "buyers" ||
    parsedQuery.importer_intent ||
    parsedQuery.recurring_buyer_intent;
  const exporterLikeIntent =
    parsedQuery.intent === "exporters" || parsedQuery.intent === "suppliers" || parsedQuery.exporter_intent;

  score += Math.round((source.defaultRankingWeight - 50) / 2);
  reasons.push(`Default weight ${source.defaultRankingWeight}`);

  if (source.priorityTier === 1) {
    score += specializedQuery ? 34 : 16;
    reasons.push("Tier 1 priority");
  } else if (source.priorityTier === 2) {
    score += specializedQuery ? 12 : 8;
    reasons.push("Tier 2 signal support");
  } else {
    score -= specializedQuery ? 26 : 6;
    reasons.push("Tier 3 fallback");
  }

  if (parsedQuery.product_category) {
    if (source.productCategoryFit.includes(parsedQuery.product_category)) {
      score += 28;
      reasons.push("Product-category fit");
    } else {
      score -= 18;
      reasons.push("Weak category fit");
    }
  }

  const queryLower = parsedQuery.query.toLowerCase();
  for (const rule of QUERY_SOURCE_BOOST_RULES) {
    if (rule.pattern.test(queryLower)) {
      const delta = rule.boosts[source.id];
      if (delta) {
        score += delta;
        reasons.push("Query-to-source mapping boost");
      }
    }
  }

  if (source.industrySpecialization.length > 0 && parsedQuery.product_category) {
    const categoryKey = parsedQuery.product_category.replace("_", "");
    const hasSpecializationMatch = source.industrySpecialization.some((item) =>
      item.replace(/[_-]/g, "").includes(categoryKey)
    );
    if (hasSpecializationMatch) {
      score += 10;
      reasons.push("Specialization match");
    }
  }

  if (source.intents.includes(parsedQuery.intent)) {
    score += 10;
    reasons.push("Intent match");
  } else {
    score -= 10;
    reasons.push("Intent mismatch");
  }

  if (source.purpose === "signal") {
    if (parsedQuery.intent === "importers" || parsedQuery.intent === "exporters" || parsedQuery.intent === "deals") {
      score += 14;
      reasons.push("Market-signal source");
    } else {
      score -= 12;
      reasons.push("Signal source (context, not RFQ listing)");
    }
  }

  if (parsedQuery.importer_intent) {
    if (source.group === "analytics") {
      score += 16;
      reasons.push("Importer intent boost");
    }
    if (source.group === "rfq_platforms") {
      score -= 12;
      reasons.push("Importer intent RFQ penalty");
    }
  }

  if (parsedQuery.exporter_intent) {
    if (source.group === "analytics") {
      score += 10;
      reasons.push("Exporter intent analytics boost");
    }
    if (source.group === "supplier_platforms") {
      score += 8;
      reasons.push("Exporter intent supplier boost");
    }
  }

  if (parsedQuery.recurring_buyer_intent) {
    if (source.group === "analytics") {
      score += 12;
      reasons.push("Recurring buyer signal boost");
    }
    if (source.group === "rfq_platforms") {
      score -= 10;
      reasons.push("Recurring intent RFQ penalty");
    }
  }

  if (source.engineAvailable) {
    score += 8;
    reasons.push("Engine available");
    if (source.executionMode !== "manual") {
      score += 7;
      reasons.push("Auto execution");
    }
  } else {
    score -= importerLikeIntent || exporterLikeIntent ? 8 : 4;
    reasons.push("No native engine");
  }

  if (parsedQuery.target_country_or_region && source.supportsCountries) {
    score += 6;
    reasons.push("Country fit");
  }

  const desiredBoost = RESULT_TYPE_GROUP_BOOST[parsedQuery.desired_result_type]?.[source.group] || 0;
  if (desiredBoost > 0) {
    score += desiredBoost;
    reasons.push(`Result-type fit ${parsedQuery.desired_result_type}`);
  }

  if (source.executionMode === "manual") {
    let manualPenalty =
      importerLikeIntent || exporterLikeIntent ? 20 : parsedQuery.intent === "deals" ? 14 : 10;
    if (specializedQuery && source.priorityTier === 1) {
      manualPenalty = Math.max(4, manualPenalty - 12);
      reasons.push("Tier 1 manual penalty reduced");
    }
    if (source.priorityTier === 3) {
      manualPenalty += 8;
    }
    score -= manualPenalty;
    reasons.push(`Manual mode penalty (${manualPenalty})`);
  }

  if (source.executionMode === "browser") {
    score += 4;
    reasons.push("Browser execution");
  }

  if (source.browserCapable && source.executionMode === "fetch") {
    score += 4;
    reasons.push("Browser fallback available");
  }

  if (source.antiBotRisk === "high") {
    score -= 8;
    reasons.push("High anti-bot risk");
  } else if (source.antiBotRisk === "medium") {
    score -= 3;
  }

  score += Math.round((source.reliabilityScore - 50) / 4);
  reasons.push(`Reliability ${source.reliabilityScore}`);

  if (parsedQuery.search_priority === "high" && source.group === "analytics") {
    score -= 4;
  }

  if (parsedQuery.custom_sources.length > 0 && source.id === "direct_websites") {
    score += 28;
    reasons.push("Custom source list");
  }

  if (specializedQuery && FALLBACK_SOURCE_IDS.has(source.id)) {
    score -= 55;
    reasons.push("Fallback-only for specialized commodity queries");
  }

  if (specializedQuery && TIER1_SOURCE_IDS.has(source.id)) {
    score += 14;
    reasons.push("Specialized Tier 1 match");
  }

  const perfAdjustment = getPerformanceAdjustment(perf);
  if (perfAdjustment.delta !== 0) {
    score += perfAdjustment.delta;
    reasons.push(perfAdjustment.reason);
  }

  const runPerfAdjustment = getRunPerformanceAdjustment(runPerf);
  if (runPerfAdjustment.delta !== 0) {
    score += runPerfAdjustment.delta;
    reasons.push(runPerfAdjustment.reason);
  }

  return {
    source_id: source.id,
    source_name: source.name,
    group: source.group,
    priority_tier: source.priorityTier,
    purpose: source.purpose,
    product_category_fit: source.productCategoryFit,
    industry_specialization: source.industrySpecialization,
    score,
    reason: reasons.join(". "),
    engine_available: source.engineAvailable,
    execution_mode: source.executionMode,
    anti_bot_risk: source.antiBotRisk,
    reliability_score: source.reliabilityScore
  } satisfies SourceRecommendation;
};

export const recommendSources = async (
  parsedQuery: ParsedQuery,
  maxSources = 5
): Promise<SourceRecommendation[]> => {
  const [performanceMap, runPerformanceMap] = await Promise.all([
    loadPerformanceMap(parsedQuery.intent),
    getRankingRunPerformanceMap(parsedQuery.intent)
  ]);

  const scored = SOURCE_CATALOG.map((source) =>
    scoreSource(source, parsedQuery, performanceMap.get(source.id), runPerformanceMap.get(source.id))
  ).sort((a, b) => b.score - a.score);

  const aiTarget = scored.slice(0, 12);
  const aiRanks = await getAIRerank(parsedQuery, aiTarget);

  const merged = scored.map((source) => {
    const ai = aiRanks[source.source_id];
    if (!ai) return source;

    const blended = Math.round(source.score * 0.72 + ai.score * 0.28);
    const reason = ai.reason ? `${source.reason}. AI: ${ai.reason}` : source.reason;

    return {
      ...source,
      score: blended,
      reason
    };
  });

  const prioritized = merged.sort((a, b) => b.score - a.score);
  const limit = Math.max(1, Math.min(maxSources, 8));
  const selected: SourceRecommendation[] = [];
  const selectedIds = new Set<SourceId>();
  const specializedQuery = isSpecializedCommodityQuery(parsedQuery);

  const tryPush = (item: SourceRecommendation) => {
    if (selected.length >= limit) return;
    if (selectedIds.has(item.source_id)) return;
    selected.push(item);
    selectedIds.add(item.source_id);
  };

  const nonFallback = prioritized.filter((item) => !FALLBACK_SOURCE_IDS.has(item.source_id));
  const fallback = prioritized.filter((item) => FALLBACK_SOURCE_IDS.has(item.source_id));

  if (specializedQuery) {
    const tier1 = nonFallback.filter((item) => item.priority_tier === 1);
    const tier2 = nonFallback.filter((item) => item.priority_tier === 2);
    tier1.forEach(tryPush);
    tier2.forEach(tryPush);
    nonFallback.forEach(tryPush);

    const weakestSelected = selected[selected.length - 1];
    const shouldAllowFallback = selected.length === 0 || (weakestSelected && weakestSelected.score < 62);
    if (shouldAllowFallback) {
      fallback.forEach(tryPush);
    }
  } else {
    nonFallback.forEach(tryPush);
    fallback.forEach(tryPush);
  }

  return selected;
};
