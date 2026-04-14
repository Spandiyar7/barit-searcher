import { z } from "zod";

export const contactSchema = z.object({
  companyId: z.string().min(1),
  fullName: z.string().trim().min(2).max(200),
  position: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(100).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(100).optional().or(z.literal("")),
  telegram: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal(""))
});

export type ContactInput = z.infer<typeof contactSchema>;
