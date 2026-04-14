import type {
  NormalizedMarketResult,
  SourceExecutionMode
} from "@/lib/services/market-intelligence/types";

export type SourceKind = "live" | "mock" | "test" | "fallback";
export type ResultImportMode = SourceExecutionMode | "generated";

type OriginInput = {
  sourceName?: string | null;
  sourceUrl?: string | null;
  rawText?: string | null;
  sourceKind?: string | null;
  importMode?: string | null;
  fallbackMode?: ResultImportMode | null;
};

const hasToken = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());

const normalize = (value: string | null | undefined) => (value || "").trim();

const isKnownSourceKind = (value: string): value is SourceKind =>
  value === "live" || value === "mock" || value === "test" || value === "fallback";

const isKnownImportMode = (value: string): value is ResultImportMode =>
  value === "fetch" || value === "browser" || value === "manual" || value === "generated";

export const inferSourceKind = (input: OriginInput): SourceKind => {
  const explicit = normalize(input.sourceKind).toLowerCase();
  if (isKnownSourceKind(explicit)) return explicit;

  const sourceName = normalize(input.sourceName).toLowerCase();
  const sourceUrl = normalize(input.sourceUrl).toLowerCase();
  const rawText = normalize(input.rawText).toLowerCase();
  const merged = `${sourceName} ${sourceUrl} ${rawText}`;

  if (sourceUrl.includes("manual-import.local")) return "fallback";
  if (hasToken(merged, /\b(fallback|index fallback|search fallback)\b/)) return "fallback";
  if (hasToken(merged, /\b(mock|demo|fixture|sample)\b/)) return "mock";
  if (hasToken(merged, /\b(test|sandbox|staging|localhost|127\.0\.0\.1|example\.com)\b/)) return "test";

  return "live";
};

export const inferImportMode = (input: OriginInput): ResultImportMode => {
  const explicit = normalize(input.importMode).toLowerCase();
  if (isKnownImportMode(explicit)) return explicit;

  if (input.fallbackMode) return input.fallbackMode;

  const sourceUrl = normalize(input.sourceUrl).toLowerCase();
  const sourceName = normalize(input.sourceName).toLowerCase();
  const rawText = normalize(input.rawText).toLowerCase();
  const merged = `${sourceName} ${sourceUrl} ${rawText}`;

  if (sourceUrl.includes("manual-import.local")) return "manual";
  if (hasToken(merged, /\b(fallback|index fallback|search fallback)\b/)) return "generated";
  if (hasToken(merged, /\b(generated|synthetic|seeded)\b/)) return "generated";
  if (hasToken(merged, /\b(mock|test|fixture)\b/)) return "generated";

  return "fetch";
};

export const withOriginMeta = (
  result: NormalizedMarketResult,
  fallbackMode?: ResultImportMode
): NormalizedMarketResult => {
  const source_kind = inferSourceKind({
    sourceName: result.source_name,
    sourceUrl: result.source_url,
    rawText: result.raw_text,
    sourceKind: result.source_kind,
    importMode: result.import_mode
  });

  const import_mode = inferImportMode({
    sourceName: result.source_name,
    sourceUrl: result.source_url,
    rawText: result.raw_text,
    sourceKind: result.source_kind,
    importMode: result.import_mode,
    fallbackMode: fallbackMode || null
  });

  return {
    ...result,
    source_kind,
    import_mode
  };
};
