import { z } from "zod";

const specsSchema = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => {
    if (!value) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error("Specs must be valid JSON");
    }
  });

export const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(120),
  synonyms: z.array(z.string().trim().min(1).max(120)).default([]),
  hsCode: z.string().trim().max(50).optional().or(z.literal("")),
  specsJson: specsSchema
});

export type ProductInput = z.infer<typeof productSchema>;
