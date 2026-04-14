import { CompanyStatus, CompanyType } from "@prisma/client";
import { z } from "zod";

export const companySchema = z.object({
  name: z.string().trim().min(2).max(200),
  companyType: z.nativeEnum(CompanyType),
  country: z.string().trim().min(2).max(100),
  city: z.string().trim().min(1).max(100),
  website: z.string().trim().url().optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  source: z.string().trim().max(255).optional().or(z.literal("")),
  status: z.nativeEnum(CompanyStatus)
});

export type CompanyInput = z.infer<typeof companySchema>;
