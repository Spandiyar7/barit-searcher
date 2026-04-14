export const emptyToNull = (value?: string | null) => {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};

export const splitSynonyms = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const decimalInput = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return undefined;
  return value;
};
