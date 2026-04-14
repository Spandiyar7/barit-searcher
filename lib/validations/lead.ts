import { LeadPriority, LeadStatus, LeadType } from "@prisma/client";
import { z } from "zod";

const nullableNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return null;
    return numeric;
  });

export const leadSchema = z.object({
  title: z.string().trim().min(3).max(255),
  productId: z.string().min(1),
  companyId: z.string().optional().nullable(),
  leadType: z.nativeEnum(LeadType),
  volume: nullableNumber,
  unit: z.string().trim().max(50).optional().or(z.literal("")),
  price: nullableNumber,
  currency: z.string().trim().max(20).optional().or(z.literal("")),
  incoterms: z.string().trim().max(20).optional().or(z.literal("")),
  originCountry: z.string().trim().max(100).optional().or(z.literal("")),
  destinationCountry: z.string().trim().max(100).optional().or(z.literal("")),
  sourceName: z.string().trim().min(2).max(255),
  sourceUrl: z.string().trim().url().optional().or(z.literal("")),
  rawText: z.string().trim().min(3).max(20000),
  aiSummary: z.string().trim().max(5000).optional().or(z.literal("")),
  priority: z.nativeEnum(LeadPriority),
  status: z.nativeEnum(LeadStatus),
  publishedAt: z.string().datetime().optional().or(z.literal(""))
});

export const leadParseSchema = z.object({
  rawText: z.string().trim().min(10).max(20000)
});

export const leadSummarizeSchema = z.object({
  title: z.string().optional(),
  rawText: z.string().trim().min(10).max(20000),
  product: z.string().optional(),
  leadType: z.nativeEnum(LeadType).optional(),
  volume: nullableNumber.optional(),
  unit: z.string().optional(),
  price: nullableNumber.optional(),
  currency: z.string().optional(),
  incoterms: z.string().optional(),
  originCountry: z.string().optional(),
  destinationCountry: z.string().optional()
});

export type LeadInput = z.infer<typeof leadSchema>;
