import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedLeadDraft } from "@/types/crm";
import type { AIProvider, LeadSummaryInput } from "./provider";
import { MockAIProvider } from "./mock";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const extractJson = <T>(input: string): T | null => {
  const match = input.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

export class GeminiProvider implements AIProvider {
  name = "gemini";
  configured = Boolean(process.env.GEMINI_API_KEY);
  private fallback = new MockAIProvider();
  private model = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: DEFAULT_MODEL })
    : null;

  async parseLeadText(rawText: string): Promise<ParsedLeadDraft> {
    if (!this.model) return this.fallback.parseLeadText(rawText);

    const prompt = `Extract JSON with keys: title, productName, leadType(BUY|SELL|INQUIRY|OFFER), volume(number|null), unit(string|null), price(number|null), currency(string|null), incoterms(string|null), originCountry(string|null), destinationCountry(string|null), confidence(number 0..1).
Text:\n${rawText}`;

    const result = await this.model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJson<ParsedLeadDraft>(text);
    if (!parsed) return this.fallback.parseLeadText(rawText);

    return {
      title: parsed.title || "Untitled lead",
      productName: parsed.productName || "Unspecified commodity",
      leadType: parsed.leadType || "INQUIRY",
      volume: parsed.volume ?? null,
      unit: parsed.unit ?? null,
      price: parsed.price ?? null,
      currency: parsed.currency ?? null,
      incoterms: parsed.incoterms ?? null,
      originCountry: parsed.originCountry ?? null,
      destinationCountry: parsed.destinationCountry ?? null,
      confidence: Math.max(0, Math.min(parsed.confidence ?? 0.5, 1))
    };
  }

  async summarizeLead(input: LeadSummaryInput): Promise<string> {
    if (!this.model) return this.fallback.summarizeLead(input);

    const prompt = `Summarize this commodity lead for trader CRM in 2-4 short sentences, concise and actionable:\n${JSON.stringify(
      input
    )}`;
    const result = await this.model.generateContent(prompt);
    return result.response.text().trim() || this.fallback.summarizeLead(input);
  }

  async suggestNextActions(input: LeadSummaryInput): Promise<string[]> {
    if (!this.model) return this.fallback.suggestNextActions(input);

    const prompt = `Return JSON array with 3-6 practical next actions for this lead. No markdown.\n${JSON.stringify(
      input
    )}`;
    const result = await this.model.generateContent(prompt);
    const text = result.response.text();

    try {
      const parsed = JSON.parse(text) as string[];
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 6);
      }
    } catch {
      const lines = text
        .split("\n")
        .map((line) => line.replace(/^[-\d.\s]+/, "").trim())
        .filter(Boolean);
      if (lines.length > 0) return lines.slice(0, 6);
    }

    return this.fallback.suggestNextActions(input);
  }
}
