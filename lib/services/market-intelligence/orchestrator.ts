import { recommendSources } from "./source-selection";
import { understandMarketQuery } from "./query-understanding";
import { enrichResultsWithAi } from "./ai-analysis";
import { executeSourceWithFallback, buildSourceDiagnostics } from "./execution";
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

  const recommendedSources = await recommendSources(parsedQuery, maxSources);

  const executionResults = await Promise.all(
    recommendedSources.map((source) => executeSourceWithFallback(source.source_id, parsedQuery, maxResultsPerSource))
  );

  const mergedResults = mergeDedupedResults(
    executionResults.map((item) => item.result),
    parsedQuery.product
  );

  const enrichedResults = await enrichResultsWithAi(mergedResults, parsedQuery);
  const diagnostics = buildSourceDiagnostics(executionResults, recommendedSources);
  const warnings = diagnostics.flatMap((item) => item.warnings.map((warning) => `${item.source_name}: ${warning}`));

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
    executed_sources: executionResults.map((item) => item.result.sourceName),
    source_diagnostics: diagnostics,
    warnings,
    results: enrichedResults
  };
};
