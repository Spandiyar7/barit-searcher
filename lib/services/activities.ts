import { prisma } from "@/lib/db/prisma";
import type { ActivityPayload } from "@/lib/validations/activity";
import { emptyToNull } from "./helpers";

export const listRecentActivities = async (limit = 12) =>
  prisma.activity.findMany({
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, fullName: true } },
      lead: { select: { id: true, title: true } },
      deal: { select: { id: true } }
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

export const createActivity = async (input: ActivityPayload) =>
  prisma.activity.create({
    data: {
      companyId: emptyToNull(input.companyId),
      contactId: emptyToNull(input.contactId),
      leadId: emptyToNull(input.leadId),
      dealId: emptyToNull(input.dealId),
      type: input.type,
      note: input.note,
      nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null
    }
  });

export const updateActivity = async (id: string, input: ActivityPayload) =>
  prisma.activity.update({
    where: { id },
    data: {
      companyId: emptyToNull(input.companyId),
      contactId: emptyToNull(input.contactId),
      leadId: emptyToNull(input.leadId),
      dealId: emptyToNull(input.dealId),
      type: input.type,
      note: input.note,
      nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null
    }
  });

export const deleteActivity = async (id: string) => prisma.activity.delete({ where: { id } });
