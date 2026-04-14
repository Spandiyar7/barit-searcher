import { z } from "zod";
import { marketIntelligenceCreateJobSchema } from "@/lib/validations/market-intelligence";

export const leadDiscoveryCreateJobSchema = marketIntelligenceCreateJobSchema.pick({
  q: true,
  country: true,
  intent: true,
  customSources: true
});

export const leadDiscoveryAssignSchema = z.object({
  leadId: z.string().trim().min(10).max(64),
  manager: z.string().trim().min(2).max(120)
});

export const leadDiscoveryContactedSchema = z.object({
  leadId: z.string().trim().min(10).max(64),
  note: z.string().trim().max(1000).optional().default("")
});

export const leadDiscoveryOutreachSchema = z.object({
  leadId: z.string().trim().min(10).max(64)
});

