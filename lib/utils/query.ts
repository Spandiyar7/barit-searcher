export const getStringParam = (
  value: string | string[] | undefined,
  fallback = ""
): string => {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
};

export const tokenizeSearch = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
