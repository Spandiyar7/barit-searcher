import { createHash } from "node:crypto";
import { Prisma, SearchJobStatus, SourceRunStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { parsedQuerySchema } from "@/lib/validations/market-intelligence";
import { enrichResultsWithAi } from "./ai-analysis";
import { executeSourceWithFallback } from "./execution";
import { importMarketIntelligenceLead } from "./import";
import { understandMarketQuery } from "./query-understanding";
import { recommendSources } from "./source-selection";
import { withOriginMeta } from "./source-origin";
import { SOURCE_BY_ID } from "./source-catalog";
import {
  findMatchingLeadBySignals,
  findMatchingRawLeadBySignals,
  updateExistingLeadFromResult
} from "./dedupe";
import type {
  CreateSearchJobInput,
  CreateSearchJobResponse,
  JobResultItem,
  MarketIntelligenceJobSnapshot,
  ParsedQuery,
  SavedSearchInput,
  SavedSearchItem,
  SearchJobSourceRun,
  SearchJobSummary,
  SourceDiagnostic,
  SourceDiagnosticCode,
  SourceId,
  SourceRecommendation,
  SourceStatus
} from "./types";

const DEFAULT_MAX_SOURCES = 5;
const DEFAULT_RESULTS_PER_SOURCE = 12;
const HIGH_CONFIDENCE_THRESHOLD = 0.72;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.58;
const MAX_WARNINGS = 60;
const RUNNING_JOB_STALE_MS = 15 * 60 * 1000;

const runningJobs = new Set<string>();

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

const normalizeSourceUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
};

const clampScore = (value: number) => Math.max(0.01, Math.min(0.99, value));

const computePersistenceRelevance = (result: JobResultItem) => {
  const base = result.relevance_score ?? result.confidence_score ?? 0;
  const contactCompleteness =
    typeof result.contact_completeness_score === "number" ? Math.max(0, Math.min(result.contact_completeness_score, 1)) : 0;
  const loweredType = (result.result_type || "").toLowerCase();
  const hasSignal =
    loweredType.includes("importer_signal") ||
    loweredType.includes("exporter_signal") ||
    loweredType.includes("recurring_buyer_signal");

  let adjusted = base;
  if (loweredType.includes("importer_signal")) adjusted += 0.09;
  if (loweredType.includes("exporter_signal")) adjusted += 0.07;
  if (loweredType.includes("recurring_buyer_signal")) adjusted += 0.13;
  if (!hasSignal && loweredType.includes("buyer_rfq")) adjusted -= 0.14;
  if (!result.company || result.company.trim().length < 2) adjusted -= 0.09;
  adjusted += contactCompleteness * 0.18;
  if (!result.contact_name && contactCompleteness < 0.2) adjusted -= 0.05;

  return Number(clampScore(adjusted).toFixed(3));
};

const sourceUrlHash = (sourceUrl: string) => createHash("sha1").update(sourceUrl.toLowerCase()).digest("hex").slice(0, 40);

const parseJsonObject = (value: Prisma.JsonValue | null): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
};

const mergeNormalizedPayload = (existing: Prisma.JsonValue | null, incoming: Record<string, unknown>, sourceUrl: string) => {
  const previous = parseJsonObject(existing);
  const canonicalSourceUrl = typeof previous.source_url === "string" && previous.source_url.trim().length > 0 ? previous.source_url : sourceUrl;
  const mergedUrls = Array.from(
    new Set([
      canonicalSourceUrl,
      sourceUrl,
      ...toStringArray(previous.alternative_source_urls),
      ...toStringArray(incoming.alternative_source_urls)
    ])
  ).slice(0, 24);

  return {
    ...previous,
    ...incoming,
    source_url: canonicalSourceUrl,
    alternative_source_urls: mergedUrls,
    dedupe_updated_at: new Date().toISOString()
  };
};

const toSearchJobSummary = (job: {
  id: string;
  status: SearchJobStatus;
  query: string;
  country: string | null;
  intent: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  totalSources: number;
  processedSources: number;
  totalResults: number;
  importedLeads: number;
  savedRawLeads: number;
  lowConfidenceDropped: number;
  errorMessage: string | null;
}, blockedSources = 0): SearchJobSummary => ({
  id: job.id,
  status: job.status,
  query: job.query,
  country: job.country,
  intent: (job.intent as SearchJobSummary["intent"]) || null,
  created_at: job.createdAt.toISOString(),
  started_at: toIso(job.startedAt),
  completed_at: toIso(job.completedAt),
  source_count: job.totalSources,
  blocked_sources: blockedSources,
  total_sources: job.totalSources,
  processed_sources: job.processedSources,
  total_results: job.totalResults,
  imported_leads: job.importedLeads,
  saved_raw_leads: job.savedRawLeads,
  low_confidence_dropped: job.lowConfidenceDropped,
  error_message: job.errorMessage
});

const parseJson = <T>(value: Prisma.JsonValue | null, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  try {
    return value as T;
  } catch {
    return fallback;
  }
};

const ensureParsedQuery = (value: Prisma.JsonValue | null): ParsedQuery | null => {
  if (!value || typeof value !== "object") return null;
  try {
    return parsedQuerySchema.parse(value);
  } catch {
    return null;
  }
};

const computeResultOrigins = (results: Array<Pick<JobResultItem, "acquisition_origin">>): NonNullable<SourceDiagnostic["result_origins"]> =>
  results.reduce(
    (acc, item) => {
      const origin = item.acquisition_origin || "unknown";
      if (origin === "directory_page") acc.directory_page += 1;
      else if (origin === "company_website") acc.company_website += 1;
      else if (origin === "browser_fallback") acc.browser_fallback += 1;
      else acc.unknown += 1;
      return acc;
    },
    {
      directory_page: 0,
      company_website: 0,
      browser_fallback: 0,
      unknown: 0
    }
  );

const inferRunStatus = (sourceStatus: SourceStatus, blocked: boolean): SourceRunStatus => {
  if (sourceStatus === "manual") return SourceRunStatus.SKIPPED;
  if (sourceStatus === "ok") return SourceRunStatus.COMPLETED;
  if (blocked || sourceStatus === "blocked") return SourceRunStatus.BLOCKED;
  if (sourceStatus === "error") return SourceRunStatus.FAILED;
  return SourceRunStatus.FAILED;
};

const updateSourcePerformance = async (payload: {
  sourceId: string;
  intent: string;
  runStatus: SourceRunStatus;
  extracted: number;
  averageRelevance: number;
}) => {
  try {
    const existing = await prisma.sourcePerformance.findUnique({
      where: {
        sourceId_intent: {
          sourceId: payload.sourceId,
          intent: payload.intent
        }
      }
    });

    const totalRuns = (existing?.totalRuns || 0) + 1;
    const successCount =
      (existing?.successCount || 0) + (payload.runStatus === SourceRunStatus.COMPLETED ? 1 : 0);
    const blockedCount = (existing?.blockedCount || 0) + (payload.runStatus === SourceRunStatus.BLOCKED ? 1 : 0);
    const totalExtracted = (existing?.totalExtracted || 0) + payload.extracted;
    const totalRelevance = (existing?.totalRelevance || 0) + payload.averageRelevance;
    const averageExtracted = totalExtracted / Math.max(totalRuns, 1);
    const averageRelevance = totalRelevance / Math.max(totalRuns, 1);

    await prisma.sourcePerformance.upsert({
      where: {
        sourceId_intent: {
          sourceId: payload.sourceId,
          intent: payload.intent
        }
      },
      create: {
        sourceId: payload.sourceId,
        intent: payload.intent,
        totalRuns,
        successCount,
        blockedCount,
        totalExtracted,
        totalRelevance,
        averageExtracted,
        averageRelevance,
        lastSuccessAt: payload.runStatus === SourceRunStatus.COMPLETED ? new Date() : null
      },
      update: {
        totalRuns,
        successCount,
        blockedCount,
        totalExtracted,
        totalRelevance,
        averageExtracted,
        averageRelevance,
        lastSuccessAt: payload.runStatus === SourceRunStatus.COMPLETED ? new Date() : existing?.lastSuccessAt || null
      }
    });
  } catch {
    // Keep pipeline resilient when metrics table is unavailable.
  }
};

const persistResult = async (input: {
  jobId: string;
  sourceRunId: string;
  result: JobResultItem;
  parsedQuery: ParsedQuery;
}) => {
  const normalizedSourceUrl = normalizeSourceUrl(input.result.source_url);
  if (!normalizedSourceUrl) {
    return {
      persistence_status: "logged" as const,
      persistence_message: "Missing source URL"
    };
  }

  const hash = sourceUrlHash(normalizedSourceUrl);
  const matchedLead = await findMatchingLeadBySignals({
    source_url: normalizedSourceUrl,
    source_name: input.result.source_name,
    company: input.result.company,
    product: input.result.product,
    description: input.result.description,
    raw_text: input.result.raw_text,
    country: input.result.country,
    contact_name: input.result.contact_name
  });

  const relevance = computePersistenceRelevance(input.result);
  const lowConfidence = relevance < MEDIUM_CONFIDENCE_THRESHOLD;
  const normalizedPayload = {
    ...input.result,
    source_url: normalizedSourceUrl,
    relevance_score: relevance,
    saved_from_search: true,
    low_confidence: lowConfidence,
    search_job_id: input.jobId,
    source_run_id: input.sourceRunId,
    alternative_source_urls: [normalizedSourceUrl]
  };

  const exactRaw = await prisma.rawMarketLead.findUnique({
    where: { sourceUrlHash: hash },
    select: {
      id: true,
      sourceUrl: true,
      sourceUrlHash: true,
      normalized: true,
      leadId: true,
      status: true
    }
  });

  const fuzzyRawMatch = exactRaw
    ? null
    : await findMatchingRawLeadBySignals({
        source_url: normalizedSourceUrl,
        source_name: input.result.source_name,
        company: input.result.company,
        product: input.result.product,
        description: input.result.description,
        raw_text: input.result.raw_text,
        country: input.result.country,
        contact_name: input.result.contact_name
      });

  const fuzzyRaw =
    !exactRaw && fuzzyRawMatch
      ? await prisma.rawMarketLead.findUnique({
          where: { id: fuzzyRawMatch.rawLeadId },
          select: {
            id: true,
            sourceUrl: true,
            sourceUrlHash: true,
            normalized: true,
            leadId: true,
            status: true
          }
        })
      : null;

  const candidateRaw = exactRaw || fuzzyRaw;
  const stagedRawLead = candidateRaw
    ? await prisma.rawMarketLead.update({
        where: { id: candidateRaw.id },
        data: {
          sourceName: input.result.source_name,
          searchJobId: input.jobId,
          sourceRunId: input.sourceRunId,
          normalized: mergeNormalizedPayload(candidateRaw.normalized, normalizedPayload, normalizedSourceUrl) as unknown as Prisma.InputJsonValue,
          aiClassification: input.result.ai_classification || null,
          aiSummary: input.result.ai_summary || null,
          relevanceScore: relevance || null,
          confidenceScore: input.result.confidence_score || null,
          status: candidateRaw.leadId ? "IMPORTED" : "PENDING_REVIEW"
        },
        select: { id: true, leadId: true }
      })
    : await prisma.rawMarketLead.create({
        data: {
          sourceName: input.result.source_name,
          sourceUrl: normalizedSourceUrl,
          sourceUrlHash: hash,
          searchJobId: input.jobId,
          sourceRunId: input.sourceRunId,
          normalized: normalizedPayload as unknown as Prisma.InputJsonValue,
          aiClassification: input.result.ai_classification || null,
          aiSummary: input.result.ai_summary || null,
          relevanceScore: relevance || null,
          confidenceScore: input.result.confidence_score || null,
          status: "PENDING_REVIEW"
        },
        select: { id: true, leadId: true }
      });

  if (matchedLead) {
    await updateExistingLeadFromResult(matchedLead.leadId, {
      source_url: normalizedSourceUrl,
      source_name: input.result.source_name,
      description: input.result.description,
      raw_text: input.result.raw_text,
      country: input.result.country,
      destination: input.result.destination,
      payment_terms: input.result.payment_terms,
      incoterms: input.result.incoterms,
      ai_summary: input.result.ai_summary,
      contact_name: input.result.contact_name
    });

    await prisma.rawMarketLead.update({
      where: { id: stagedRawLead.id },
      data: {
        status: "IMPORTED",
        leadId: matchedLead.leadId
      }
    });

    return {
      persistence_status: "duplicate" as const,
      persistence_message: "Lead already exists",
      lead_id: matchedLead.leadId,
      raw_lead_id: stagedRawLead.id
    };
  }

  if (stagedRawLead.leadId) {
    await updateExistingLeadFromResult(stagedRawLead.leadId, {
      source_url: normalizedSourceUrl,
      source_name: input.result.source_name,
      description: input.result.description,
      raw_text: input.result.raw_text,
      country: input.result.country,
      destination: input.result.destination,
      payment_terms: input.result.payment_terms,
      incoterms: input.result.incoterms,
      ai_summary: input.result.ai_summary,
      contact_name: input.result.contact_name
    });

    return {
      persistence_status: "duplicate" as const,
      persistence_message: "Matched existing imported lead",
      lead_id: stagedRawLead.leadId,
      raw_lead_id: stagedRawLead.id
    };
  }

  if (relevance >= HIGH_CONFIDENCE_THRESHOLD) {
    const imported = await importMarketIntelligenceLead({
      result: {
        ...normalizedPayload,
        relevance_score: relevance,
        source_url: normalizedSourceUrl
      },
      parsed_query: input.parsedQuery,
      save_company: true,
      with_ai: false
    });

    await prisma.rawMarketLead.update({
      where: { id: stagedRawLead.id },
      data: {
        status: "IMPORTED",
        leadId: imported.leadId
      }
    });

    return {
      persistence_status: imported.status === "imported" ? ("imported" as const) : ("duplicate" as const),
      persistence_message: imported.message,
      lead_id: imported.leadId,
      raw_lead_id: stagedRawLead.id
    };
  }

  if (relevance >= MEDIUM_CONFIDENCE_THRESHOLD) {
    return {
      persistence_status: "staged" as const,
      persistence_message: "Saved to raw market leads",
      raw_lead_id: stagedRawLead.id
    };
  }

  return {
    persistence_status: "logged" as const,
    persistence_message: "Saved to raw market leads (low confidence)",
    raw_lead_id: stagedRawLead.id
  };
};

const buildSourceRunSnapshot = (run: {
  id: string;
  sourceId: string;
  sourceName: string;
  executionMode: string;
  status: SourceRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  responseStatus: number | null;
  parseStatus: string | null;
  extractedResults: number;
  importedLeads: number;
  savedRawLeads: number;
  blocked: boolean;
  warnings: string[];
}): SearchJobSourceRun => ({
  id: run.id,
  source_id: run.sourceId,
  source_name: run.sourceName,
  execution_mode: run.executionMode,
  status: run.status,
  started_at: toIso(run.startedAt),
  completed_at: toIso(run.completedAt),
  response_status: run.responseStatus,
  parse_status: run.parseStatus,
  extracted_results: run.extractedResults,
  imported_leads: run.importedLeads,
  saved_raw_leads: run.savedRawLeads,
  blocked: run.blocked,
  warnings: run.warnings
});

const inferDiagnosticCode = (payload: {
  noAdapter: boolean;
  fallbackBlocked: boolean;
  nativeAttempted: boolean;
  nativeSuccess: boolean;
  extracted: number;
}): SourceDiagnosticCode => {
  if (payload.noAdapter) return "no_adapter";
  if (payload.fallbackBlocked) return "fallback_blocked";
  if (payload.nativeAttempted && !payload.nativeSuccess) return "source_native_failure";
  if (payload.extracted === 0) return "empty_results";
  return "ok";
};

const mapRunDiagnostics = (run: {
  sourceId: string;
  sourceName: string;
  executionMode: string;
  status: SourceRunStatus;
  responseStatus: number | null;
  parseStatus: string | null;
  extractedResults: number;
  blocked: boolean;
  warnings: string[];
  diagnostics: Prisma.JsonValue | null;
  resultsJson: Prisma.JsonValue | null;
}, recommendation?: SourceRecommendation): SourceDiagnostic => {
  const fromDb = parseJson<SourceDiagnostic | null>(run.diagnostics, null);
  if (fromDb) {
    return {
      ...fromDb,
      priority_tier: fromDb.priority_tier ?? recommendation?.priority_tier,
      selection_reason: fromDb.selection_reason ?? recommendation?.reason
    };
  }

  const runResults = parseJson<JobResultItem[]>(run.resultsJson, []);

  const fallbackStatus =
    run.status === SourceRunStatus.BLOCKED
      ? "blocked"
      : run.status === SourceRunStatus.FAILED
        ? "error"
        : run.status === SourceRunStatus.SKIPPED
          ? "manual"
          : "ok";

  return {
    source_id: run.sourceId as SourceDiagnostic["source_id"],
    source_name: run.sourceName,
    priority_tier: recommendation?.priority_tier,
    diagnostic_code: run.extractedResults > 0 ? "ok" : run.blocked ? "fallback_blocked" : "empty_results",
    acquisition_path: run.executionMode === "manual" ? "fallback_only" : "native",
    status: fallbackStatus,
    execution_mode: run.executionMode as SourceDiagnostic["execution_mode"],
    attempted_modes: [run.executionMode as SourceDiagnostic["execution_mode"]],
    anti_bot_risk: "medium",
    reliability_score: 0,
    response_status: run.responseStatus,
    parse_status: (run.parseStatus || "skipped") as SourceDiagnostic["parse_status"],
    extracted_results: run.extractedResults,
    blocked: run.blocked,
    selection_reason: recommendation?.reason,
    warnings: run.warnings,
    open_source_url: null,
    save_search_url: null,
    result_origins: computeResultOrigins(runResults)
  };
};

const getJobSnapshotOrThrow = async (jobId: string): Promise<MarketIntelligenceJobSnapshot> => {
  const job = await prisma.searchJob.findUnique({
    where: { id: jobId },
    include: {
      sourceRuns: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!job) throw new Error("Search job not found");

  const parsedQuery = ensureParsedQuery(job.parsedQuery);
  if (!parsedQuery) throw new Error("Search job parsed query is invalid");

  const recommendedSources = parseJson<SourceRecommendation[]>(job.recommendedSources, []);
  const recommendationMap = new Map(recommendedSources.map((item) => [item.source_id, item]));
  const runs = job.sourceRuns.map((run) => buildSourceRunSnapshot(run));
  const diagnostics = job.sourceRuns.map((run) => mapRunDiagnostics(run, recommendationMap.get(run.sourceId as SourceId)));
  const results = job.sourceRuns.flatMap((run) => parseJson<JobResultItem[]>(run.resultsJson, []));
  const warnings = Array.from(new Set([...(job.warnings || []), ...job.sourceRuns.flatMap((run) => run.warnings)])).slice(
    0,
    MAX_WARNINGS
  );

  return {
    job: toSearchJobSummary(
      job,
      job.sourceRuns.filter((run) => run.blocked || run.status === SourceRunStatus.BLOCKED).length
    ),
    parsed_query: parsedQuery,
    recommended_sources: recommendedSources,
    source_diagnostics: diagnostics,
    source_runs: runs,
    warnings,
    results
  };
};

const bumpSavedSearchRun = async (savedSearchId: string | null | undefined) => {
  if (!savedSearchId) return;

  const saved = await prisma.savedSearch.findUnique({
    where: { id: savedSearchId },
    select: { id: true, frequencyHours: true }
  });
  if (!saved) return;

  const now = new Date();
  const nextRunAt = new Date(now.getTime() + saved.frequencyHours * 60 * 60 * 1000);

  await prisma.savedSearch.update({
    where: { id: saved.id },
    data: {
      lastRunAt: now,
      nextRunAt
    }
  });
};

export const processSearchJob = async (jobId: string) => {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  try {
    const job = await prisma.searchJob.findUnique({
      where: { id: jobId },
      include: {
        sourceRuns: {
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!job) return;
    if (job.status === SearchJobStatus.COMPLETED || job.status === SearchJobStatus.CANCELED) return;
    if (job.status === SearchJobStatus.FAILED) return;

    if (job.status === SearchJobStatus.PENDING) {
      const claimed = await prisma.searchJob.updateMany({
        where: {
          id: job.id,
          status: SearchJobStatus.PENDING
        },
        data: {
          status: SearchJobStatus.RUNNING,
          startedAt: new Date()
        }
      });

      if (claimed.count === 0) return;
    } else if (job.status === SearchJobStatus.RUNNING) {
      const startedAt = job.startedAt?.getTime() || 0;
      const isLikelyActive = startedAt > 0 && Date.now() - startedAt < RUNNING_JOB_STALE_MS;
      if (isLikelyActive) return;

      await prisma.searchJob.update({
        where: { id: job.id },
        data: {
          startedAt: new Date()
        }
      });
    }

    const parsedQuery = ensureParsedQuery(job.parsedQuery);
    if (!parsedQuery) {
      await prisma.searchJob.update({
        where: { id: job.id },
        data: {
          status: SearchJobStatus.FAILED,
          failedAt: new Date(),
          errorMessage: "Invalid parsed query payload"
        }
      });
      return;
    }

    let processedSources = 0;
    let totalResults = 0;
    let importedLeads = 0;
    let savedRawLeads = 0;
    let lowConfidenceDropped = 0;
    const jobWarnings: string[] = [];

    const maxResultsPerSource = job.maxResultsPerSource || DEFAULT_RESULTS_PER_SOURCE;
    const recommendedSources = parseJson<SourceRecommendation[]>(job.recommendedSources, []);
    const recommendationMap = new Map(recommendedSources.map((item) => [item.source_id, item]));

    for (const run of job.sourceRuns) {
      if (run.status === SourceRunStatus.COMPLETED || run.status === SourceRunStatus.BLOCKED || run.status === SourceRunStatus.SKIPPED) {
        processedSources += 1;
        totalResults += run.extractedResults;
        importedLeads += run.importedLeads;
        savedRawLeads += run.savedRawLeads;
        continue;
      }

      await prisma.searchJobSourceRun.update({
        where: { id: run.id },
        data: {
          status: SourceRunStatus.RUNNING,
          startedAt: new Date()
        }
      });

      const execution = await executeSourceWithFallback(run.sourceId as SourceId, parsedQuery, maxResultsPerSource);
      const aiEnriched = await enrichResultsWithAi(execution.result.results, parsedQuery);
      const resultPayloads: JobResultItem[] = [];

      let runImported = 0;
      let runRaw = 0;
      let runLow = 0;

      for (const result of aiEnriched) {
        const normalizedResult = withOriginMeta(result, execution.result.execution_mode);
        const persisted = await persistResult({
          jobId: job.id,
          sourceRunId: run.id,
          result: {
            ...normalizedResult,
            persistence_status: "logged"
          },
          parsedQuery
        });

        if (persisted.persistence_status === "imported") runImported += 1;
        if (persisted.persistence_status === "staged") runRaw += 1;
        if (persisted.persistence_status === "logged") {
          runRaw += 1;
          runLow += 1;
        }

        resultPayloads.push({
          ...normalizedResult,
          persistence_status: persisted.persistence_status,
          persistence_message: persisted.persistence_message,
          lead_id: persisted.lead_id,
          raw_lead_id: persisted.raw_lead_id
        });
      }

      const runStatus = inferRunStatus(execution.result.status, execution.result.blocked);
      const sourceMeta = SOURCE_BY_ID.get(execution.result.sourceId);
      const recommendation = recommendationMap.get(run.sourceId as SourceId);
      const diagnostics: SourceDiagnostic = {
        source_id: execution.result.sourceId,
        source_name: execution.result.sourceName,
        priority_tier: recommendation?.priority_tier ?? sourceMeta?.priorityTier,
        diagnostic_code: inferDiagnosticCode({
          noAdapter: execution.trace.no_adapter,
          fallbackBlocked: execution.trace.fallback_blocked || execution.result.status === "blocked",
          nativeAttempted: execution.trace.native_attempted,
          nativeSuccess: execution.trace.native_success,
          extracted: execution.result.extracted_results
        }),
        acquisition_path: execution.trace.native_attempted
          ? execution.trace.fallback_attempted
            ? "native_plus_fallback"
            : "native"
          : execution.trace.fallback_attempted
            ? "fallback_only"
            : "none",
        status: execution.result.status,
        execution_mode: execution.result.execution_mode,
        attempted_modes: execution.attempted_modes,
        anti_bot_risk: sourceMeta?.antiBotRisk || "medium",
        reliability_score: sourceMeta?.reliabilityScore ?? 0,
        response_status: execution.result.response_status,
        parse_status: execution.result.parse_status,
        extracted_results: execution.result.extracted_results,
        blocked: execution.result.blocked,
        selection_reason: recommendation?.reason,
        warnings: execution.result.warnings,
        open_source_url: execution.result.fetchedUrls[0] || null,
        save_search_url: execution.result.fetchedUrls[0] || null,
        result_origins: computeResultOrigins(resultPayloads)
      };

      await prisma.searchJobSourceRun.update({
        where: { id: run.id },
        data: {
          status: runStatus,
          completedAt: new Date(),
          executionMode: execution.result.execution_mode,
          responseStatus: execution.result.response_status,
          parseStatus: execution.result.parse_status,
          extractedResults: execution.result.extracted_results,
          importedLeads: runImported,
          savedRawLeads: runRaw,
          blocked: execution.result.blocked,
          warnings: execution.result.warnings,
          diagnostics: diagnostics as unknown as Prisma.InputJsonValue,
          resultsJson: resultPayloads as unknown as Prisma.InputJsonValue
        }
      });

      const averageRelevance =
        resultPayloads.length > 0
          ? resultPayloads.reduce((acc, item) => acc + (item.relevance_score || 0), 0) / resultPayloads.length
          : 0;

      await updateSourcePerformance({
        sourceId: run.sourceId,
        intent: parsedQuery.intent,
        runStatus,
        extracted: execution.result.extracted_results,
        averageRelevance
      });

      processedSources += 1;
      totalResults += execution.result.extracted_results;
      importedLeads += runImported;
      savedRawLeads += runRaw;
      lowConfidenceDropped += runLow;
      jobWarnings.push(...execution.result.warnings.map((warning) => `${execution.result.sourceName}: ${warning}`));

      await prisma.searchJob.update({
        where: { id: job.id },
        data: {
          processedSources,
          totalResults,
          importedLeads,
          savedRawLeads,
          lowConfidenceDropped,
          warnings: Array.from(new Set(jobWarnings)).slice(0, MAX_WARNINGS)
        }
      });
    }

    await prisma.searchJob.update({
      where: { id: job.id },
      data: {
        status: SearchJobStatus.COMPLETED,
        completedAt: new Date(),
        processedSources,
        totalResults,
        importedLeads,
        savedRawLeads,
        lowConfidenceDropped,
        warnings: Array.from(new Set(jobWarnings)).slice(0, MAX_WARNINGS)
      }
    });

    await bumpSavedSearchRun(job.savedSearchId);
  } catch (error) {
    await prisma.searchJob.updateMany({
      where: { id: jobId },
      data: {
        status: SearchJobStatus.FAILED,
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Search job failed"
      }
    });
  } finally {
    runningJobs.delete(jobId);
  }
};

const enqueueSearchJob = (jobId: string) => {
  setTimeout(() => {
    void processSearchJob(jobId);
  }, 0);
};

export const ensureSearchJobRunning = async (jobId: string) => {
  const job = await prisma.searchJob.findUnique({
    where: { id: jobId },
    select: { status: true, startedAt: true }
  });
  if (!job) return;

  if (job.status === SearchJobStatus.PENDING) {
    enqueueSearchJob(jobId);
    return;
  }

  if (job.status === SearchJobStatus.RUNNING) {
    const startedAt = job.startedAt?.getTime() || 0;
    const isLikelyStale = startedAt === 0 || Date.now() - startedAt >= RUNNING_JOB_STALE_MS;
    if (isLikelyStale) {
      enqueueSearchJob(jobId);
    }
  }
};

export const createSearchJob = async (input: CreateSearchJobInput): Promise<CreateSearchJobResponse> => {
  const parsedQuery = await understandMarketQuery(input);
  const maxSources = Math.max(1, Math.min(input.maxSources || DEFAULT_MAX_SOURCES, 8));
  const maxResultsPerSource = Math.max(3, Math.min(input.maxResultsPerSource || DEFAULT_RESULTS_PER_SOURCE, 25));
  const recommendedSources = await recommendSources(parsedQuery, maxSources);
  const selectedSources = recommendedSources.map((source) => source.source_id);

  const job = await prisma.searchJob.create({
    data: {
      query: input.query,
      country: input.country || null,
      intent: input.intent || parsedQuery.intent,
      customSources: input.customSources || [],
      parsedQuery: parsedQuery as unknown as Prisma.InputJsonValue,
      recommendedSources: recommendedSources as unknown as Prisma.InputJsonValue,
      selectedSources,
      maxSources,
      maxResultsPerSource,
      totalSources: selectedSources.length,
      status: SearchJobStatus.PENDING,
      savedSearchId: input.savedSearchId || null,
      sourceRuns: {
        create: recommendedSources.map((source) => ({
          sourceId: source.source_id,
          sourceName: source.source_name,
          executionMode: source.execution_mode,
          status: SourceRunStatus.PENDING
        }))
      }
    },
    select: {
      id: true,
      status: true
    }
  });

  enqueueSearchJob(job.id);

  return {
    job_id: job.id,
    status: job.status
  };
};

export const getSearchJobSnapshot = async (jobId: string): Promise<MarketIntelligenceJobSnapshot> => {
  await ensureSearchJobRunning(jobId);
  return getJobSnapshotOrThrow(jobId);
};

export const listSearchJobs = async (limit = 30): Promise<SearchJobSummary[]> => {
  const safeLimit = Math.max(5, Math.min(limit, 100));
  const items = await prisma.searchJob.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    include: {
      sourceRuns: {
        select: {
          blocked: true,
          status: true
        }
      }
    }
  });

  return items.map((item) =>
    toSearchJobSummary(
      item,
      item.sourceRuns.filter((run) => run.blocked || run.status === SourceRunStatus.BLOCKED).length
    )
  );
};

export const rerunSearchJob = async (jobId: string): Promise<CreateSearchJobResponse> => {
  const job = await prisma.searchJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      query: true,
      country: true,
      intent: true,
      customSources: true,
      maxSources: true,
      maxResultsPerSource: true,
      savedSearchId: true
    }
  });

  if (!job) throw new Error("Search job not found");

  return createSearchJob({
    query: job.query,
    country: job.country || undefined,
    intent: (job.intent as CreateSearchJobInput["intent"]) || undefined,
    customSources: job.customSources,
    maxSources: job.maxSources,
    maxResultsPerSource: job.maxResultsPerSource,
    savedSearchId: job.savedSearchId
  });
};

export const createSavedSearch = async (input: SavedSearchInput): Promise<SavedSearchItem> => {
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + input.frequencyHours * 60 * 60 * 1000);

  const saved = await prisma.savedSearch.create({
    data: {
      name: input.name,
      keyword: input.keyword,
      country: input.country || null,
      intent: input.intent || null,
      customSources: input.customSources || [],
      frequencyHours: input.frequencyHours,
      isActive: input.isActive ?? true,
      nextRunAt
    }
  });

  return {
    id: saved.id,
    name: saved.name,
    keyword: saved.keyword,
    country: saved.country,
    intent: (saved.intent as SavedSearchItem["intent"]) || null,
    custom_sources: saved.customSources,
    frequency_hours: saved.frequencyHours,
    is_active: saved.isActive,
    last_run_at: toIso(saved.lastRunAt),
    next_run_at: toIso(saved.nextRunAt),
    created_at: saved.createdAt.toISOString()
  };
};

export const listSavedSearches = async (): Promise<SavedSearchItem[]> => {
  const items = await prisma.savedSearch.findMany({
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }, { createdAt: "desc" }]
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    keyword: item.keyword,
    country: item.country,
    intent: (item.intent as SavedSearchItem["intent"]) || null,
    custom_sources: item.customSources,
    frequency_hours: item.frequencyHours,
    is_active: item.isActive,
    last_run_at: toIso(item.lastRunAt),
    next_run_at: toIso(item.nextRunAt),
    created_at: item.createdAt.toISOString()
  }));
};

export const runSavedSearchNow = async (savedSearchId: string) => {
  const saved = await prisma.savedSearch.findUnique({
    where: { id: savedSearchId }
  });
  if (!saved) throw new Error("Saved search not found");
  if (!saved.isActive) throw new Error("Saved search is inactive");

  return createSearchJob({
    query: saved.keyword,
    country: saved.country,
    intent: (saved.intent as CreateSearchJobInput["intent"]) || null,
    customSources: saved.customSources,
    savedSearchId: saved.id
  });
};

export const runDueSavedSearches = async (limit = 5) => {
  const now = new Date();
  const due = await prisma.savedSearch.findMany({
    where: {
      isActive: true,
      nextRunAt: {
        lte: now
      }
    },
    orderBy: { nextRunAt: "asc" },
    take: Math.max(1, Math.min(limit, 25))
  });

  const createdJobs: string[] = [];

  for (const saved of due) {
    const nextRunAt = new Date(now.getTime() + saved.frequencyHours * 60 * 60 * 1000);
    const claimed = await prisma.savedSearch.updateMany({
      where: {
        id: saved.id,
        isActive: true,
        nextRunAt: saved.nextRunAt
      },
      data: {
        lastRunAt: now,
        nextRunAt
      }
    });

    if (claimed.count === 0) continue;

    const job = await createSearchJob({
      query: saved.keyword,
      country: saved.country,
      intent: (saved.intent as CreateSearchJobInput["intent"]) || null,
      customSources: saved.customSources,
      savedSearchId: saved.id
    });
    createdJobs.push(job.job_id);
  }

  return {
    scheduled: createdJobs.length,
    job_ids: createdJobs
  };
};
