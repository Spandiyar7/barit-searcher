import { NextRequest } from "next/server";
import { ActivityType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leadDiscoveryAssignSchema } from "@/lib/validations/lead-discovery";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = leadDiscoveryAssignSchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: payload.leadId },
      select: { id: true, companyId: true, title: true }
    });

    if (!lead) return apiError("Lead not found", 404);

    const activity = await prisma.activity.create({
      data: {
        leadId: lead.id,
        companyId: lead.companyId,
        type: ActivityType.TASK,
        note: `Assigned manager: ${payload.manager}. Lead: ${lead.title}`
      }
    });

    return apiOk({ leadId: lead.id, activityId: activity.id, manager: payload.manager });
  } catch (error) {
    return apiError(parseZodError(error), 400);
  }
}

