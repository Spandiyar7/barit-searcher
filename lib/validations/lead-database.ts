import { z } from "zod";
import { leadDiscoveryCreateJobSchema } from "@/lib/validations/lead-discovery";

export const leadDatabaseCreateJobSchema = leadDiscoveryCreateJobSchema;

export const leadDatabaseListQuerySchema = z.object({
  q: z.string().trim().max(180).optional().default(""),
  product: z.string().trim().max(120).optional().default(""),
  role: z
    .enum(["buyer", "supplier", "importer", "exporter", "manufacturer", "trader"])
    .optional(),
  tier: z.enum(["ready", "actionable", "signal"]).optional(),
  country: z.string().trim().max(80).optional().default(""),
  source: z.string().trim().max(120).optional().default(""),
  confidence: z.coerce.number().min(0).max(100).optional(),
  has_contact: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  has_email: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  has_phone: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  has_volume: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  limit: z.coerce.number().int().min(20).max(600).optional().default(250)
});
