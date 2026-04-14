import OpenAI from "openai";
import type { ParsedLeadDraft } from "@/types/crm";
import type { AIProvider, LeadSummaryInput } from "./provider";
import { MockAIProvider } from "./mock";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const REQUEST_TIMEOUT_MS = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 12000);

const extractJson = <T>(input: string): T | null => {
  const match = input.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
};

export class OpenAIProvider implements AIProvider {
  name = "openai";
  configured = Boolean(process.env.OPENAI_API_KEY);
  private client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
  private fallback = new MockAIProvider();

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error("OpenAI request timeout")), REQUEST_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async parseLeadText(rawText: string): Promise<ParsedLeadDraft> {
    if (!this.client) return this.fallback.parseLeadText(rawText);
    try {
      const prompt = `You are a commodity trading analyst. Extract structured lead fields from raw inquiry text.
Return JSON with keys: title, productName, leadType(BUY|SELL|INQUIRY|OFFER), volume(number|null), unit(string|null), price(number|null), currency(string|null), incoterms(string|null), originCountry(string|null), destinationCountry(string|null), confidence(number between 0 and 1).`;

      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: DEFAULT_MODEL,
          temperature: 0.1,
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: rawText }
          ]
        })
      );

      const content = completion.choices[0]?.message?.content ?? "";
      const parsed = extractJson<ParsedLeadDraft>(content);
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
    } catch {
      return this.fallback.parseLeadText(rawText);
    }
  }

  async summarizeLead(input: LeadSummaryInput): Promise<string> {
    if (!this.client) return this.fallback.summarizeLead(input);
    try {
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: DEFAULT_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Summarize commodity trading lead in 2-4 short sentences for an internal trader CRM. Keep it actionable and concise."
            },
            {
              role: "user",
              content: JSON.stringify(input)
            }
          ]
        })
      );

      return completion.choices[0]?.message?.content?.trim() || this.fallback.summarizeLead(input);
    } catch {
      return this.fallback.summarizeLead(input);
    }
  }

  async suggestNextActions(input: LeadSummaryInput): Promise<string[]> {
    if (!this.client) return this.fallback.suggestNextActions(input);
    try {
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: DEFAULT_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Return a JSON array of 3-6 practical next actions for a commodity trader handling this lead. No markdown."
            },
            {
              role: "user",
              content: JSON.stringify(input)
            }
          ]
        })
      );

      const text = completion.choices[0]?.message?.content ?? "";
      try {
        const parsed = JSON.parse(text) as string[];
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => typeof item === "string" && item.trim().length > 0).slice(0, 6);
        }
      } catch {
        const lines = text
          .split("\n")
          .map((line) => line.replace(/^[-\d.\s]+/, "").trim())
          .filter(Boolean);
        if (lines.length > 0) return lines.slice(0, 6);
      }

      return this.fallback.suggestNextActions(input);
    } catch {
      return this.fallback.suggestNextActions(input);
    }
  }
}
