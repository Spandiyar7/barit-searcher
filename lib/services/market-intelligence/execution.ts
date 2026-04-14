import { SOURCE_BY_ID } from "./source-catalog";
import { MARKET_SOURCE_ENGINES } from "./engines";
import { runAutomatedSourceIndexFallback } from "./index-fallback";
import type {
  ParsedQuery,
  SourceDiagnostic,
  SourceDiagnosticCode,
  SourceEngineResult,
  SourceExecutionTrace,
  SourceExecutionMode,
  SourceId,
  SourceRecommendation,
  SourceStatus
} from "./types";

const SOURCE_EXECUTION_TIMEOUT_MS = Math.max(
  15_000,
  Number(process.env.MARKET_SOURCE_EXEC_TIMEOUT_MS || 75_000)
);

const dedupeSourceResults = (items: SourceEngineResult[]) => {
  const map = new Map<string, SourceEngineResult["results"][number]>();

  items.forEach((sourceItem) => {
    sourceItem.results.forEach((result) => {
      const key = result.source_url.trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (!existing || result.confidence_score > existing.confidence_score) {
        map.set(key, result);
      }
    });
  });

  return Array.from(map.values());
};

const mergeSourceEngineRuns = (runs: SourceEngineResult[]): SourceEngineResult => {
  const [first] = runs;
  const mergedResults = dedupeSourceResults(runs);
  const warnings = runs.flatMap((run) => run.warnings);
  const fetchedUrls = Array.from(new Set(runs.flatMap((run) => run.fetchedUrls)));
  const httpStatuses = runs.flatMap((run) => run.http_statuses);

  const blocked = runs.some((run) => run.blocked);
  const antiBotDetected = runs.some((run) => run.anti_bot_detected);

  const latest = runs[runs.length - 1];

  const status: SourceStatus =
    mergedResults.length > 0
      ? "ok"
      : blocked
        ? "blocked"
        : latest.status === "manual"
          ? "manual"
          : warnings.length > 0
            ? "error"
            : latest.status;

  const parseStatus = mergedResults.length > 0 ? "success" : latest.parse_status;

  return {
    sourceId: first.sourceId,
    sourceName: first.sourceName,
    execution_mode: latest.execution_mode,
    fetchedUrls,
    warnings,
    http_statuses: httpStatuses,
    response_status: httpStatuses[0] ?? null,
    blocked,
    anti_bot_detected: antiBotDetected,
    parse_status: parseStatus,
    status,
    extracted_results: mergedResults.length,
    results: mergedResults
  };
};

const manualModeResult = (sourceId: SourceId, sourceName: string, message: string): SourceEngineResult => ({
  sourceId,
  sourceName,
  execution_mode: "manual",
  fetchedUrls: [],
  warnings: [message],
  http_statuses: [],
  response_status: null,
  blocked: false,
  anti_bot_detected: false,
  parse_status: "skipped",
  status: "manual",
  extracted_results: 0,
  results: []
});

const timeoutResult = (sourceId: SourceId, sourceName: string, mode: SourceExecutionMode): SourceEngineResult => ({
  sourceId,
  sourceName,
  execution_mode: mode,
  fetchedUrls: [],
  warnings: [`${sourceName}: execution timeout after ${SOURCE_EXECUTION_TIMEOUT_MS}ms.`],
  http_statuses: [],
  response_status: null,
  blocked: false,
  anti_bot_detected: false,
  parse_status: "failed",
  status: "error",
  extracted_results: 0,
  results: []
});

const withExecutionTimeout = async (
  sourceId: SourceId,
  sourceName: string,
  mode: SourceExecutionMode,
  promise: Promise<SourceEngineResult>
) =>
  await Promise.race<SourceEngineResult>([
    promise,
    new Promise<SourceEngineResult>((resolve) => {
      setTimeout(() => resolve(timeoutResult(sourceId, sourceName, mode)), SOURCE_EXECUTION_TIMEOUT_MS);
    })
  ]);

const inferFallbackBlocked = (result: SourceEngineResult | null) => {
  if (!result) return false;
  if (result.blocked || result.response_status === 403) return true;
  return result.warnings.some((warning) => /\b(403|blocked|challenge|captcha|anti-bot)\b/i.test(warning));
};

const inferDiagnosticCode = (trace: SourceExecutionTrace, result: SourceEngineResult): SourceDiagnosticCode => {
  if (trace.no_adapter) return "no_adapter";
  if (trace.fallback_attempted && (trace.fallback_blocked || result.status === "blocked")) return "fallback_blocked";
  if (trace.native_attempted && !trace.native_success) return "source_native_failure";
  if (result.extracted_results === 0) return "empty_results";
  return "ok";
};

const inferAcquisitionPath = (trace: SourceExecutionTrace): SourceDiagnostic["acquisition_path"] => {
  if (trace.native_attempted && trace.fallback_attempted) return "native_plus_fallback";
  if (!trace.native_attempted && trace.fallback_attempted) return "fallback_only";
  if (trace.native_attempted) return "native";
  return "none";
};

export const executeSourceWithFallback = async (
  sourceId: SourceId,
  parsedQuery: ParsedQuery,
  maxResults: number
): Promise<{ result: SourceEngineResult; attempted_modes: SourceExecutionMode[]; trace: SourceExecutionTrace }> => {
  const source = SOURCE_BY_ID.get(sourceId);

  if (!source) {
    const trace: SourceExecutionTrace = {
      source_id: sourceId,
      no_adapter: true,
      native_attempted: false,
      native_success: false,
      fallback_attempted: false,
      fallback_success: false,
      fallback_blocked: false,
      fallback_error: false,
      empty_results: true
    };
    return {
      result: manualModeResult(sourceId, sourceId, `Unknown source: ${sourceId}`),
      attempted_modes: ["manual"],
      trace
    };
  }

  const runAutomatedFallback = async (
    message: string,
    options: { noAdapter: boolean; fallbackAttemptedFrom: SourceExecutionMode[] }
  ) => {
    const fallbackRun = await runAutomatedSourceIndexFallback({
      sourceId,
      sourceName: source.name,
      parsedQuery,
      maxResults
    });

    if (fallbackRun) {
      fallbackRun.warnings = [message, ...fallbackRun.warnings];
      const fallbackBlocked = inferFallbackBlocked(fallbackRun);
      const fallbackSuccess = fallbackRun.results.length > 0;
      const trace: SourceExecutionTrace = {
        source_id: sourceId,
        no_adapter: options.noAdapter,
        native_attempted: false,
        native_success: false,
        fallback_attempted: true,
        fallback_success: fallbackSuccess,
        fallback_blocked: fallbackBlocked,
        fallback_error: !fallbackSuccess && !fallbackBlocked,
        empty_results: fallbackRun.results.length === 0
      };

      return {
        result: fallbackRun,
        attempted_modes: options.fallbackAttemptedFrom,
        trace
      };
    }

    const trace: SourceExecutionTrace = {
      source_id: sourceId,
      no_adapter: options.noAdapter,
      native_attempted: false,
      native_success: false,
      fallback_attempted: false,
      fallback_success: false,
      fallback_blocked: false,
      fallback_error: true,
      empty_results: true
    };

    return {
      result: manualModeResult(sourceId, source.name, message),
      attempted_modes: ["manual"] as SourceExecutionMode[],
      trace
    };
  };

  if (source.executionMode === "manual") {
    return runAutomatedFallback(`${source.name}: manual execution mode configured; automated index fallback attempted.`, {
      noAdapter: false,
      fallbackAttemptedFrom: ["manual", "fetch"]
    });
  }

  const engine = MARKET_SOURCE_ENGINES[sourceId];
  if (!engine) {
    return runAutomatedFallback(
      `${source.name}: no native engine implemented; automated index fallback attempted.`,
      {
        noAdapter: true,
        fallbackAttemptedFrom: ["manual", "fetch"]
      }
    );
  }

  const runs: SourceEngineResult[] = [];
  const attemptedModes: SourceExecutionMode[] = [];

  const primaryMode: SourceExecutionMode = source.executionMode;
  attemptedModes.push(primaryMode);

  const primary = await withExecutionTimeout(
    sourceId,
    source.name,
    primaryMode,
    engine({
      parsedQuery,
      source,
      maxResults,
      executionMode: primaryMode
    })
  );

  runs.push(primary);
  let fallbackAttempted = false;
  let fallbackSuccess = false;
  let fallbackBlocked = false;
  let fallbackError = false;

  const shouldFallbackToBrowser =
    primaryMode === "fetch" &&
    source.browserCapable &&
    (primary.blocked || primary.anti_bot_detected || primary.response_status === 403);

  if (shouldFallbackToBrowser) {
    attemptedModes.push("browser");
    const browserRun = await withExecutionTimeout(
      sourceId,
      source.name,
      "browser",
      engine({
        parsedQuery,
        source,
        maxResults,
        executionMode: "browser"
      })
    );
    browserRun.warnings = [`${source.name}: fetch mode was blocked/challenged, attempted browser fallback.`, ...browserRun.warnings];
    runs.push(browserRun);
  }

  const mergedAfterPrimary = mergeSourceEngineRuns(runs);
  const shouldUseAutomatedIndexFallback =
    mergedAfterPrimary.results.length === 0 &&
    (mergedAfterPrimary.blocked ||
      mergedAfterPrimary.anti_bot_detected ||
      mergedAfterPrimary.parse_status === "failed" ||
      mergedAfterPrimary.parse_status === "empty" ||
      mergedAfterPrimary.status === "error");

  if (shouldUseAutomatedIndexFallback) {
    fallbackAttempted = true;
    const fallbackRun = await runAutomatedSourceIndexFallback({
      sourceId,
      sourceName: source.name,
      parsedQuery,
      maxResults
    });

    if (fallbackRun) {
      fallbackRun.warnings = [
        `${source.name}: source execution returned blocked/empty data, automated index fallback engaged.`,
        ...fallbackRun.warnings
      ];
      runs.push(fallbackRun);
      fallbackBlocked = inferFallbackBlocked(fallbackRun);
      fallbackSuccess = fallbackRun.results.length > 0;
      fallbackError = !fallbackSuccess && !fallbackBlocked;
    } else {
      fallbackError = true;
    }
  }

  const merged = mergeSourceEngineRuns(runs);
  const nativeSuccess = primary.results.length > 0 || merged.results.length > 0;
  const trace: SourceExecutionTrace = {
    source_id: sourceId,
    no_adapter: false,
    native_attempted: true,
    native_success: nativeSuccess,
    fallback_attempted: fallbackAttempted,
    fallback_success: fallbackSuccess,
    fallback_blocked: fallbackBlocked,
    fallback_error: fallbackError,
    empty_results: merged.results.length === 0
  };

  return {
    result: merged,
    attempted_modes: attemptedModes,
    trace
  };
};

export const buildSourceDiagnostics = (
  executionResults: Array<{ result: SourceEngineResult; attempted_modes: SourceExecutionMode[]; trace?: SourceExecutionTrace }>,
  recommendations: SourceRecommendation[] = []
): SourceDiagnostic[] =>
  executionResults.map(({ result, attempted_modes, trace }) => {
    const source = SOURCE_BY_ID.get(result.sourceId);
    const recommendation = recommendations.find((item) => item.source_id === result.sourceId);
    const fallbackTrace: SourceExecutionTrace = trace || {
      source_id: result.sourceId,
      no_adapter: false,
      native_attempted: true,
      native_success: result.extracted_results > 0,
      fallback_attempted: false,
      fallback_success: false,
      fallback_blocked: false,
      fallback_error: false,
      empty_results: result.extracted_results === 0
    };

    return {
      source_id: result.sourceId,
      source_name: result.sourceName,
      priority_tier: source?.priorityTier,
      diagnostic_code: inferDiagnosticCode(fallbackTrace, result),
      acquisition_path: inferAcquisitionPath(fallbackTrace),
      status: result.status,
      execution_mode: result.execution_mode,
      attempted_modes,
      anti_bot_risk: source?.antiBotRisk || "medium",
      reliability_score: source?.reliabilityScore ?? 0,
      response_status: result.response_status,
      parse_status: result.parse_status,
      extracted_results: result.extracted_results,
      blocked: result.blocked,
      selection_reason: recommendation?.reason,
      warnings: result.warnings,
      open_source_url: result.fetchedUrls[0] || null,
      save_search_url: result.fetchedUrls[0] || null
    };
  });
