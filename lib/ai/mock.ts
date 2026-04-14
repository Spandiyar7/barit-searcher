import type { LeadType } from "@prisma/client";
import type { ParsedLeadDraft } from "@/types/crm";
import type { AIProvider, LeadSummaryInput } from "./provider";

const detectLeadType = (raw: string): LeadType => {
  const text = raw.toLowerCase();
  if (text.includes("looking to buy") || text.includes("need") || text.includes("buy")) return "BUY";
  if (text.includes("offer") || text.includes("available") || text.includes("sell")) return "SELL";
  if (text.includes("inquiry")) return "INQUIRY";
  return "OFFER";
};

const detectCurrency = (raw: string): string | null => {
  const text = raw.toUpperCase();
  if (text.includes("USD") || text.includes("$")) return "USD";
  if (text.includes("EUR") || text.includes("€")) return "EUR";
  if (text.includes("RUB")) return "RUB";
  if (text.includes("KZT")) return "KZT";
  return null;
};

const detectIncoterms = (raw: string): string | null => {
  const text = raw.toUpperCase();
  const terms = ["FOB", "CIF", "CFR", "DAP", "EXW", "FCA"];
  return terms.find((term) => text.includes(term)) ?? null;
};

const detectVolume = (raw: string): { volume: number | null; unit: string | null } => {
  const match = raw.match(/(\d+(?:[\.,]\d+)?)\s*(mt|tons|tonnes|kg|m3|bbl)/i);
  if (!match) return { volume: null, unit: null };
  return {
    volume: Number(match[1].replace(",", ".")),
    unit: match[2].toUpperCase()
  };
};

const detectPrice = (raw: string): number | null => {
  const match = raw.match(/(?:usd|eur|\$|€)\s*(\d+(?:[\.,]\d+)?)/i);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
};

const detectProduct = (raw: string): string => {
  const lowercase = raw.toLowerCase();
  const knownProducts = [
    "barite",
    "sulfur",
    "urea",
    "polypropylene",
    "chickpeas",
    "lentils",
    "wheat",
    "sunflower oil"
  ];
  return knownProducts.find((product) => lowercase.includes(product)) ?? "Unspecified commodity";
};

export class MockAIProvider implements AIProvider {
  name = "mock";
  configured = false;

  async parseLeadText(rawText: string): Promise<ParsedLeadDraft> {
    const { volume, unit } = detectVolume(rawText);
    const leadType = detectLeadType(rawText);
    const productName = detectProduct(rawText);

    return {
      title: `${leadType === "BUY" ? "Buying" : "Selling"} inquiry for ${productName}`,
      productName,
      leadType,
      volume,
      unit,
      price: detectPrice(rawText),
      currency: detectCurrency(rawText),
      incoterms: detectIncoterms(rawText),
      originCountry: null,
      destinationCountry: null,
      confidence: 0.46
    };
  }

  async summarizeLead(input: LeadSummaryInput): Promise<string> {
    const product = input.product || "commodity";
    const direction = input.leadType ? `${input.leadType.toLowerCase()} lead` : "trade lead";
    const logistics = [input.incoterms, input.originCountry, input.destinationCountry]
      .filter(Boolean)
      .join(" / ");

    const sentence1 = `This ${direction} is focused on ${product} and was captured from manual CRM input.`;
    const sentence2 = input.volume
      ? `Indicative size is ${input.volume} ${input.unit ?? "units"}${
          input.price ? ` at around ${input.price} ${input.currency ?? ""}` : ""
        }.`
      : "Volume and pricing still need verification with the counterparty.";
    const sentence3 = logistics
      ? `Current logistics context: ${logistics}.`
      : "Incoterms and routing are not finalized yet.";

    return [sentence1, sentence2, sentence3].join(" ");
  }

  async suggestNextActions(input: LeadSummaryInput): Promise<string[]> {
    const actions = [
      "Validate product specification and quality parameters with the counterparty.",
      "Confirm monthly/spot volume split and shipment schedule.",
      "Verify preferred Incoterms and discharge destination before quoting."
    ];

    if (input.leadType === "BUY") {
      actions.push("Shortlist 3 matching suppliers and request fresh offers.");
    }

    if (input.leadType === "SELL") {
      actions.push("Identify qualified buyers in target destination and circulate a soft offer.");
    }

    return actions;
  }
}
