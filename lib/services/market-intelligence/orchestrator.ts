import { planSourceSelection } from "./source-selection";
import { understandMarketQuery } from "./query-understanding";
import { enrichResultsWithAi } from "./ai-analysis";
import { executeSourceWithFallback, buildSourceDiagnostics } from "./execution";
import { filterPrimaryLeadResults } from "./result-quality";
import type {
  MarketIntelligenceSearchInput,
  MarketIntelligenceSearchResponse,
  NormalizedMarketResult,
  SourceEngineResult
} from "./types";

const DEFAULT_MAX_SOURCES = 5;
const DEFAULT_RESULTS_PER_SOURCE = 12;

const mergeDedupedResults = (sourceResults: SourceEngineResult[], parsedProduct: string | null) => {
  const byUrl = new Map<string, NormalizedMarketResult>();

  sourceResults.forEach((source) => {
    source.results.forEach((result) => {
      const key = result.source_url.trim().toLowerCase();
      if (!key) return;

      const normalized: NormalizedMarketResult = {
        ...result,
        product: result.product || parsedProduct
      };

      const existing = byUrl.get(key);
      if (!existing || normalized.confidence_score > existing.confidence_score) {
        byUrl.set(key, normalized);
      }
    });
  });

  return Array.from(byUrl.values());
};

export const runMarketIntelligenceSearch = async (
  input: MarketIntelligenceSearchInput
): Promise<MarketIntelligenceSearchResponse> => {
  const parsedQuery = await understandMarketQuery(input);
  const maxSources = Math.max(1, Math.min(input.maxSources || DEFAULT_MAX_SOURCES, 8));
  const maxResultsPerSource = Math.max(3, Math.min(input.maxResultsPerSource || DEFAULT_RESULTS_PER_SOURCE, 25));

  const selectionPlan = await planSourceSelection(parsedQuery, maxSources);
  const recommendedSources = selectionPlan.selected;

  let executionResults = await Promise.all(
    recommendedSources.map((source) =>
      executeSourceWithFallback(source.source_id, parsedQuery, maxResultsPerSource, {
        allowAutomatedIndexFallback: false
      })
    )
  );

  let mergedResults = mergeDedupedResults(
    executionResults.map((item) => item.result),
    parsedQuery.product
  );
  let quality = filterPrimaryLeadResults(mergedResults);

  if (quality.kept.length === 0 && recommendedSources.length > 0) {
    const fallbackSource = recommendedSources[0];
    const fallbackExecution = await executeSourceWithFallback(fallbackSource.source_id, parsedQuery, maxResultsPerSource, {
      allowAutomatedIndexFallback: true
    });
    executionResults = executionResults.map((item) =>
      item.result.sourceId === fallbackExecution.result.sourceId ? fallbackExecution : item
    );
    mergedResults = mergeDedupedResults(
      executionResults.map((item) => item.result),
      parsedQuery.product
    );
    quality = filterPrimaryLeadResults(mergedResults);
  }

  const enrichedResults = await enrichResultsWithAi(quality.kept, parsedQuery);
  const diagnostics = buildSourceDiagnostics(executionResults, recommendedSources);
  const warnings = diagnostics.flatMap((item) => item.warnings.map((warning) => `${item.source_name}: ${warning}`));

  if (quality.rejected.length > 0) {
    warnings.push(`Excluded ${quality.rejected.length} media/news-like records from primary lead discovery.`);
  }

  diagnostics.forEach((diagnostic) => {
    if (diagnostic.blocked) {
      warnings.push(
        `${diagnostic.source_name} is blocked/challenged in automated mode. Use Open Source, Save Search Link, or Manual Import fallback.`
      );
    }
  });

  if (parsedQuery.custom_sources.length > 0) {
    warnings.push(
      `Custom source domains provided: ${parsedQuery.custom_sources.join(", ")}. Add dedicated engines later for automated crawling.`
    );
  }

  return {
    parsed_query: parsedQuery,
    recommended_sources: recommendedSources,
    skipped_sources: selectionPlan.skipped,
    source_registry: selectionPlan.source_registry,
    executed_sources: executionResults.map((item) => item.result.sourceName),
    source_diagnostics: diagnostics,
    warnings,
    results: enrichedResults
  };
};
