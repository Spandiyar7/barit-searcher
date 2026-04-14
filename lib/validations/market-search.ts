import { z } from "zod";

const modeSchema = z.enum(["buyers", "suppliers"]);

const optionalText = z
  .union([z.string().trim().max(300), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

export const marketSearchQuerySchema = z.object({
  keyword: z.string().trim().min(2).max(120),
  mode: modeSchema.default("buyers"),
  country: z.string().trim().max(100).optional().default("")
});

export const marketSearchResultSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(2).max(255),
  companyName: optionalText,
  country: optionalText,
  quantity: optionalText,
  paymentTerms: optionalText,
  shippingTerms: optionalText,
  destination: optionalText,
  sourceUrl: z.string().trim().url(),
  snippet: z.string().trim().min(1).max(20000),
  postedDate: optionalText,
  mode: modeSchema
});

export const marketSearchImportSchema = z.object({
  result: marketSearchResultSchema,
  keyword: z.string().trim().max(120).optional(),
  withAi: z.boolean().optional().default(false)
});
