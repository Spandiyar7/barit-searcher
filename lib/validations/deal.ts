import { DealStage } from "@prisma/client";
import { z } from "zod";

const nullableNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return null;
    return numeric;
  });

export const dealSchema = z.object({
  productId: z.string().min(1),
  sourceLeadId: z.string().optional().nullable(),
  sellerCompanyId: z.string().optional().nullable(),
  buyerCompanyId: z.string().optional().nullable(),
  volume: nullableNumber,
  unit: z.string().trim().max(50).optional().or(z.literal("")),
  price: nullableNumber,
  currency: z.string().trim().max(20).optional().or(z.literal("")),
  incoterms: z.string().trim().max(20).optional().or(z.literal("")),
  originCountry: z.string().trim().max(100).optional().or(z.literal("")),
  destinationCountry: z.string().trim().max(100).optional().or(z.literal("")),
  stage: z.nativeEnum(DealStage),
  notes: z.string().trim().max(10000).optional().or(z.literal(""))
});

export type DealInput = z.infer<typeof dealSchema>;
