import { SOURCE_BY_ID } from "./source-catalog";
import { MARKET_SOURCE_ENGINES } from "./engines";
import { runAutomatedSourceIndexFallback } from "./index-fallback";
import type {
  ParsedQuery,
  SourceDiagnostic,
  SourceEngineResult,
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

export const executeSourceWithFallback = async (
  sourceId: SourceId,
  parsedQuery: ParsedQuery,
  maxResults: number
): Promise<{ result: SourceEngineResult; attempted_modes: SourceExecutionMode[] }> => {
  const source = SOURCE_BY_ID.get(sourceId);

  if (!source) {
    return {
      result: manualModeResult(sourceId, sourceId, `Unknown source: ${sourceId}`),
      attempted_modes: ["manual"]
    };
  }

  const runAutomatedFallback = async (message: string) => {
    const fallbackRun = await runAutomatedSourceIndexFallback({
      sourceId,
      sourceName: source.name,
      parsedQuery,
      maxResults
    });

    if (fallbackRun) {
      fallbackRun.warnings = [message, ...fallbackRun.warnings];
      return {
        result: fallbackRun,
        attempted_modes: ["manual", "fetch"] as SourceExecutionMode[]
      };
    }

    return {
      result: manualModeResult(sourceId, source.name, message),
      attempted_modes: ["manual"] as SourceExecutionMode[]
    };
  };

  if (source.executionMode === "manual") {
    return runAutomatedFallback(`${source.name}: manual execution mode configured; automated index fallback attempted.`);
  }

  const engine = MARKET_SOURCE_ENGINES[sourceId];
  if (!engine) {
    return runAutomatedFallback(
      `${source.name}: no native engine implemented; automated index fallback attempted.`
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
    }
  }

  return {
    result: mergeSourceEngineRuns(runs),
    attempted_modes: attemptedModes
  };
};

export const buildSourceDiagnostics = (
  executionResults: Array<{ result: SourceEngineResult; attempted_modes: SourceExecutionMode[] }>,
  recommendations: SourceRecommendation[] = []
): SourceDiagnostic[] =>
  executionResults.map(({ result, attempted_modes }) => {
    const source = SOURCE_BY_ID.get(result.sourceId);
    const recommendation = recommendations.find((item) => item.source_id === result.sourceId);

    return {
      source_id: result.sourceId,
      source_name: result.sourceName,
      priority_tier: source?.priorityTier,
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
