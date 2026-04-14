import { searchGo4WorldBusiness } from "@/lib/services/market-search/go4worldbusiness";
import type { SourceEngineInput, SourceEngineResult } from "../types";
import { normalizeText, truncate } from "./shared";
import { withOriginMeta } from "../source-origin";

const getResultType = (intent: SourceEngineInput["parsedQuery"]["intent"]) => {
  if (intent === "buyers" || intent === "importers" || intent === "rfq") return "buyer_rfq";
  if (intent === "suppliers" || intent === "manufacturers" || intent === "exporters") return "supplier_offer";
  return "trade_listing";
};

export const runGo4WorldBusinessEngine = async (input: SourceEngineInput): Promise<SourceEngineResult> => {
  const mode =
    input.parsedQuery.intent === "suppliers" ||
    input.parsedQuery.intent === "manufacturers" ||
    input.parsedQuery.intent === "exporters"
      ? "suppliers"
      : "buyers";

  try {
    const response = await searchGo4WorldBusiness({
      keyword: input.parsedQuery.product || input.parsedQuery.query,
      mode,
      country: input.parsedQuery.target_country_or_region || ""
    });

    const results = response.results.slice(0, input.maxResults).map((item) =>
      withOriginMeta(
        {
          id: item.id,
          product: input.parsedQuery.product,
          company: item.companyName,
          contact_name: null,
          country: item.country,
          quantity: item.quantity,
          incoterms: (() => {
            const text = normalizeText(`${item.shippingTerms || ""} ${item.snippet}`);
            const term = text.match(/\b(EXW|FCA|CPT|CIP|DAP|DPU|DDP|FAS|FOB|CFR|CIF)\b/i);
            return term ? term[1].toUpperCase() : null;
          })(),
          payment_terms: item.paymentTerms,
          description: truncate(item.snippet, 1000),
          source_name: "go4WorldBusiness",
          source_url: item.sourceUrl,
          raw_text: truncate(
            [
              item.title,
              item.snippet,
              item.companyName ? `Company: ${item.companyName}` : "",
              item.country ? `Country: ${item.country}` : "",
              item.quantity ? `Quantity: ${item.quantity}` : "",
              item.paymentTerms ? `Payment: ${item.paymentTerms}` : "",
              item.shippingTerms ? `Shipping: ${item.shippingTerms}` : "",
              item.destination ? `Destination: ${item.destination}` : "",
              item.postedDate ? `Posted: ${item.postedDate}` : ""
            ]
              .filter(Boolean)
              .join("\n"),
            16000
          ),
          result_type: getResultType(input.parsedQuery.intent),
          confidence_score: 0.74,
          shipping_terms: item.shippingTerms,
          destination: item.destination,
          posted_date: item.postedDate
        },
        "fetch"
      )
    );

    return {
      sourceId: "go4worldbusiness",
      sourceName: "go4WorldBusiness",
      execution_mode: "fetch",
      fetchedUrls: response.fetchedUrls,
      warnings: response.warnings,
      http_statuses: [],
      response_status: null,
      blocked: false,
      anti_bot_detected: false,
      parse_status: results.length > 0 ? "success" : "empty",
      status: results.length > 0 ? "ok" : response.warnings.length ? "error" : "ok",
      extracted_results: results.length,
      results
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch go4WorldBusiness";
    const blocked = /challenge|anti-bot|403|forbidden|captcha/i.test(message);

    return {
      sourceId: "go4worldbusiness",
      sourceName: "go4WorldBusiness",
      execution_mode: "fetch",
      fetchedUrls: [],
      warnings: [message],
      http_statuses: [],
      response_status: null,
      blocked,
      anti_bot_detected: /challenge|anti-bot|captcha/i.test(message),
      parse_status: "failed",
      status: blocked ? "blocked" : "error",
      extracted_results: 0,
      results: []
    };
  }
};
