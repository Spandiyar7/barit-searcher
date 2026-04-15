import type { ParsedQuery } from "./types";

const normalizeText = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim();

const dedupe = (items: string[]) => {
  const map = new Map<string, string>();
  items.forEach((item) => {
    const normalized = normalizeText(item);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!map.has(key)) map.set(key, normalized);
  });
  return Array.from(map.values());
};

const FOOD_AGRI_TEMPLATES = [
  "food distributor {country}",
  "wholesale {product} {country}",
  "food trading company {country}",
  "{product} wholesale {country}",
  "{product} importer {country}",
  "{product} distributor {country}",
  "{product} supplier {country}",
  "{product} trading company {country}"
];

const GENERAL_TEMPLATES = [
  "{product} {country} official website",
  "{product} {country} company",
  "{product} {country} trading company",
  "{product} {country} importer",
  "{product} {country} supplier",
  "{product} {country} distributor",
  "{product} {country} contact"
];

const withTemplate = (template: string, params: { product: string; country: string }) =>
  normalizeText(template.replaceAll("{product}", params.product).replaceAll("{country}", params.country));

export const buildCompanyFirstQueryVariants = (parsedQuery: ParsedQuery) => {
  const product = normalizeText(parsedQuery.product || parsedQuery.query);
  const country = normalizeText(
    parsedQuery.target_country_or_region ||
      parsedQuery.buyer_country ||
      parsedQuery.supplier_country ||
      parsedQuery.destination_country ||
      parsedQuery.origin_country ||
      ""
  );

  const variants: string[] = [parsedQuery.query];

  const params = {
    product: product || parsedQuery.query,
    country: country || ""
  };

  GENERAL_TEMPLATES.forEach((template) => {
    variants.push(withTemplate(template, params));
  });

  if (parsedQuery.product_category === "food_agriculture") {
    FOOD_AGRI_TEMPLATES.forEach((template) => {
      variants.push(withTemplate(template, params));
    });
  }

  if (parsedQuery.intent === "importers" || parsedQuery.intent === "buyers") {
    variants.push(normalizeText(`${params.product} import company ${params.country}`));
    variants.push(normalizeText(`${params.product} buyers ${params.country}`));
  }

  if (
    parsedQuery.intent === "suppliers" ||
    parsedQuery.intent === "manufacturers" ||
    parsedQuery.intent === "exporters"
  ) {
    variants.push(normalizeText(`${params.product} manufacturer ${params.country}`));
    variants.push(normalizeText(`${params.product} exporters ${params.country}`));
  }

  return dedupe(variants).slice(0, 14);
};
