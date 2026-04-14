import { z } from "zod";

export const aiRawLeadSchema = z.object({
  rawText: z.string().trim().min(10).max(20000)
});

export const aiSuggestSchema = z.object({
  context: z.string().trim().min(5).max(20000)
});
