import { ActivityType } from "@prisma/client";
import { z } from "zod";

export const activitySchema = z.object({
  companyId: z.string().optional().nullable(),
  contactId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  type: z.nativeEnum(ActivityType),
  note: z.string().trim().min(2).max(5000),
  nextActionDate: z.string().datetime().optional().or(z.literal("")).nullable()
});

export type ActivityPayload = z.infer<typeof activitySchema>;
