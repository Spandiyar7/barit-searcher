import { SourceRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { SOURCE_CATALOG } from "@/lib/services/market-intelligence/source-catalog";
import type { SearchIntent } from "@/lib/services/market-intelligence/types";

const INTENT_ORDER: SearchIntent[] = ["buyers", "suppliers", "manufacturers", "importers", "exporters", "rfq", "deals"];

type MutableSourceStats = {
  sourceId: string;
  sourceName: string;
  totalRuns: number;
  automatedRuns: number;
  successfulRuns: number;
  blockedRuns: number;
  emptyRuns: number;
  fetchSuccessRuns: number;
  parseSuccessRuns: number;
  importedLeadRuns: number;
  totalExtracted: number;
  totalImported: number;
  totalRaw: number;
  averageExtractedResults: number;
  averageImportedLeads: number;
  averageRawLeads: number;
  successRate: number;
  blockedRate: number;
  fetchSuccessRate: number;
  parseSuccessRate: number;
  importedLeadRate: number;
  lastSuccessAt: Date | null;
  lastBlockedAt: Date | null;
  bestIntentTypes: string[];
  bestProductCategories: string[];
  intentStats: Map<string, { runs: number; success: number; imported: number; extracted: number }>;
  categoryCounts: Map<string, number>;
};

export type SourcePerformanceRow = Omit<MutableSourceStats, "intentStats" | "categoryCounts">;

export type SourcePerformanceDashboardData = {
  rows: SourcePerformanceRow[];
  topPerforming: SourcePerformanceRow[];
  mostBlocked: SourcePerformanceRow[];
  importedLeadsBySource: SourcePerformanceRow[];
  rawLeadsBySource: SourcePerformanceRow[];
  bestSource: SourcePerformanceRow | null;
  worstSource: SourcePerformanceRow | null;
};

const toFixed2 = (value: number) => Number(value.toFixed(2));

const createEmptyStats = (sourceId: string, sourceName: string): MutableSourceStats => ({
  sourceId,
  sourceName,
  totalRuns: 0,
  automatedRuns: 0,
  successfulRuns: 0,
  blockedRuns: 0,
  emptyRuns: 0,
  fetchSuccessRuns: 0,
  parseSuccessRuns: 0,
  importedLeadRuns: 0,
  totalExtracted: 0,
  totalImported: 0,
  totalRaw: 0,
  averageExtractedResults: 0,
  averageImportedLeads: 0,
  averageRawLeads: 0,
  successRate: 0,
  blockedRate: 0,
  fetchSuccessRate: 0,
  parseSuccessRate: 0,
  importedLeadRate: 0,
  lastSuccessAt: null,
  lastBlockedAt: null,
  bestIntentTypes: [],
  bestProductCategories: [],
  intentStats: new Map(),
  categoryCounts: new Map()
});

const finalizeStats = (item: MutableSourceStats): SourcePerformanceRow => {
  const denominator = Math.max(item.automatedRuns, 1);
  item.averageExtractedResults = toFixed2(item.totalExtracted / denominator);
  item.averageImportedLeads = toFixed2(item.totalImported / denominator);
  item.averageRawLeads = toFixed2(item.totalRaw / denominator);
  item.successRate = toFixed2((item.successfulRuns / denominator) * 100);
  item.blockedRate = toFixed2((item.blockedRuns / denominator) * 100);
  item.fetchSuccessRate = toFixed2((item.fetchSuccessRuns / denominator) * 100);
  item.parseSuccessRate = toFixed2((item.parseSuccessRuns / denominator) * 100);
  item.importedLeadRate = toFixed2((item.importedLeadRuns / denominator) * 100);

  const bestIntents = Array.from(item.intentStats.entries())
    .filter(([, value]) => value.runs > 0)
    .map(([intent, value]) => ({
      intent,
      score:
        value.runs >= 2
          ? (value.success / value.runs) * 100 + value.imported * 6 + value.extracted * 0.6
          : value.imported * 6 + value.extracted * 0.5
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.intent);

  const bestCategories = Array.from(item.categoryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category]) => category);

  return {
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    totalRuns: item.totalRuns,
    automatedRuns: item.automatedRuns,
    successfulRuns: item.successfulRuns,
    blockedRuns: item.blockedRuns,
    emptyRuns: item.emptyRuns,
    fetchSuccessRuns: item.fetchSuccessRuns,
    parseSuccessRuns: item.parseSuccessRuns,
    importedLeadRuns: item.importedLeadRuns,
    totalExtracted: item.totalExtracted,
    totalImported: item.totalImported,
    totalRaw: item.totalRaw,
    averageExtractedResults: item.averageExtractedResults,
    averageImportedLeads: item.averageImportedLeads,
    averageRawLeads: item.averageRawLeads,
    successRate: item.successRate,
    blockedRate: item.blockedRate,
    fetchSuccessRate: item.fetchSuccessRate,
    parseSuccessRate: item.parseSuccessRate,
    importedLeadRate: item.importedLeadRate,
    lastSuccessAt: item.lastSuccessAt,
    lastBlockedAt: item.lastBlockedAt,
    bestIntentTypes: bestIntents,
    bestProductCategories: bestCategories
  };
};

const isTerminalStatus = (status: SourceRunStatus) =>
  status === SourceRunStatus.COMPLETED ||
  status === SourceRunStatus.FAILED ||
  status === SourceRunStatus.BLOCKED ||
  status === SourceRunStatus.SKIPPED;

const isSuccessfulRun = (status: SourceRunStatus, extracted: number, imported: number, raw: number) =>
  status !== SourceRunStatus.SKIPPED && (extracted > 0 || imported > 0 || raw > 0);

export const getSourcePerformanceDashboardData = async (): Promise<SourcePerformanceDashboardData> => {
  const statsBySource = new Map<string, MutableSourceStats>();

  SOURCE_CATALOG.forEach((source) => {
    statsBySource.set(source.id, createEmptyStats(source.id, source.name));
  });

  const runs = await prisma.searchJobSourceRun.findMany({
    select: {
      sourceId: true,
      sourceName: true,
      executionMode: true,
      status: true,
      blocked: true,
      responseStatus: true,
      parseStatus: true,
      extractedResults: true,
      importedLeads: true,
      savedRawLeads: true,
      completedAt: true,
      createdAt: true,
      job: {
        select: {
          intent: true
        }
      }
    }
  });

  runs.forEach((run) => {
    if (!isTerminalStatus(run.status)) return;

    if (!statsBySource.has(run.sourceId)) {
      statsBySource.set(run.sourceId, createEmptyStats(run.sourceId, run.sourceName));
    }

    const row = statsBySource.get(run.sourceId)!;
    const completedAt = run.completedAt || run.createdAt;
    const isAutomated = run.executionMode !== "manual";
    const blocked = isAutomated && (run.status === SourceRunStatus.BLOCKED || run.blocked);
    const meaningfulSuccess = isAutomated && isSuccessfulRun(run.status, run.extractedResults, run.importedLeads, run.savedRawLeads);

    row.totalRuns += 1;
    row.totalExtracted += run.extractedResults;
    row.totalImported += run.importedLeads;
    row.totalRaw += run.savedRawLeads;

    if (isAutomated) {
      row.automatedRuns += 1;

      const fetchSuccess =
        typeof run.responseStatus === "number"
          ? run.responseStatus >= 200 && run.responseStatus < 400
          : meaningfulSuccess;

      if (fetchSuccess) row.fetchSuccessRuns += 1;
      if (run.parseStatus === "success" || run.extractedResults > 0) row.parseSuccessRuns += 1;
      if (run.importedLeads > 0) row.importedLeadRuns += 1;
    }

    if (blocked) {
      row.blockedRuns += 1;
      if (!row.lastBlockedAt || completedAt > row.lastBlockedAt) row.lastBlockedAt = completedAt;
    }

    if (isAutomated && !blocked && run.extractedResults === 0) {
      row.emptyRuns += 1;
    }

    if (meaningfulSuccess) {
      row.successfulRuns += 1;
      if (!row.lastSuccessAt || completedAt > row.lastSuccessAt) row.lastSuccessAt = completedAt;
    }

    if (!isAutomated) return;

    const intent = (run.job.intent || "unknown").toLowerCase();
    const currentIntent = row.intentStats.get(intent) || {
      runs: 0,
      success: 0,
      imported: 0,
      extracted: 0
    };

    currentIntent.runs += 1;
    currentIntent.extracted += run.extractedResults;
    currentIntent.imported += run.importedLeads;
    if (meaningfulSuccess) currentIntent.success += 1;
    row.intentStats.set(intent, currentIntent);
  });

  const sourceNames = Array.from(new Set(Array.from(statsBySource.values()).map((item) => item.sourceName))).filter(Boolean);
  const importedLeads = await prisma.lead.findMany({
    where: {
      sourceName: {
        in: sourceNames
      }
    },
    select: {
      sourceName: true,
      product: {
        select: { category: true }
      }
    }
  });

  importedLeads.forEach((lead) => {
    const sourceEntry = Array.from(statsBySource.values()).find((item) => item.sourceName === lead.sourceName);
    if (!sourceEntry) return;
    const category = lead.product?.category?.trim();
    if (!category) return;
    sourceEntry.categoryCounts.set(category, (sourceEntry.categoryCounts.get(category) || 0) + 1);
  });

  const rows = Array.from(statsBySource.values()).map((item) => finalizeStats(item));
  const rowsWithRuns = rows.filter((item) => item.totalRuns > 0);

  const topPerforming = [...rowsWithRuns]
    .sort((a, b) => b.successRate - a.successRate || b.importedLeadRate - a.importedLeadRate)
    .slice(0, 6);

  const mostBlocked = [...rowsWithRuns]
    .sort((a, b) => b.blockedRate - a.blockedRate || b.blockedRuns - a.blockedRuns)
    .slice(0, 6);

  const importedLeadsBySource = [...rowsWithRuns].sort((a, b) => b.totalImported - a.totalImported).slice(0, 6);
  const rawLeadsBySource = [...rowsWithRuns].sort((a, b) => b.totalRaw - a.totalRaw).slice(0, 6);

  const bestSource = topPerforming[0] || null;
  const worstSource = mostBlocked[0] || null;

  return {
    rows: rows.sort((a, b) => b.automatedRuns - a.automatedRuns || b.successRate - a.successRate),
    topPerforming,
    mostBlocked,
    importedLeadsBySource,
    rawLeadsBySource,
    bestSource,
    worstSource
  };
};

export const getRankingRunPerformanceMap = async (intent: SearchIntent) => {
  const rows = await prisma.searchJobSourceRun.findMany({
    where: {
      status: {
        in: [SourceRunStatus.COMPLETED, SourceRunStatus.FAILED, SourceRunStatus.BLOCKED, SourceRunStatus.SKIPPED]
      },
      job: {
        OR: [{ intent }, { intent: null }]
      }
    },
    select: {
      sourceId: true,
      executionMode: true,
      status: true,
      blocked: true,
      extractedResults: true,
      importedLeads: true,
      savedRawLeads: true
    }
  });

  const map = new Map<
    string,
    {
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
    }
  >();

  rows.forEach((row) => {
    if (row.executionMode === "manual") return;

    const current =
      map.get(row.sourceId) || {
        totalRuns: 0,
        successRuns: 0,
        blockedRuns: 0,
        emptyRuns: 0,
        totalExtracted: 0,
        totalImported: 0,
        totalRaw: 0,
        averageExtracted: 0,
        averageImported: 0,
        averageRaw: 0,
        successRate: 0,
        blockedRate: 0
      };

    current.totalRuns += 1;
    current.totalExtracted += row.extractedResults;
    current.totalImported += row.importedLeads;
    current.totalRaw += row.savedRawLeads;

    const blocked = row.status === SourceRunStatus.BLOCKED || row.blocked;
    if (blocked) current.blockedRuns += 1;
    if (!blocked && row.extractedResults === 0) current.emptyRuns += 1;
    if (isSuccessfulRun(row.status, row.extractedResults, row.importedLeads, row.savedRawLeads)) current.successRuns += 1;

    map.set(row.sourceId, current);
  });

  map.forEach((value) => {
    const denominator = Math.max(value.totalRuns, 1);
    value.averageExtracted = toFixed2(value.totalExtracted / denominator);
    value.averageImported = toFixed2(value.totalImported / denominator);
    value.averageRaw = toFixed2(value.totalRaw / denominator);
    value.successRate = toFixed2(value.successRuns / denominator);
    value.blockedRate = toFixed2(value.blockedRuns / denominator);
  });

  return map;
};

export const sourceIntentOptions = INTENT_ORDER;
