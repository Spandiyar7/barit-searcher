import type { LeadType } from "@prisma/client";
import type { ParsedLeadDraft } from "@/types/crm";

export type LeadSummaryInput = {
  title?: string;
  rawText: string;
  product?: string;
  leadType?: LeadType;
  volume?: number | null;
  unit?: string | null;
  price?: number | null;
  currency?: string | null;
  incoterms?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
};

export interface AIProvider {
  readonly name: string;
  readonly configured: boolean;
  parseLeadText(rawText: string): Promise<ParsedLeadDraft>;
  summarizeLead(input: LeadSummaryInput): Promise<string>;
  suggestNextActions(input: LeadSummaryInput): Promise<string[]>;
}
