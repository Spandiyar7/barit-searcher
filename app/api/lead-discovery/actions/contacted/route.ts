import { NextRequest } from "next/server";
import { ActivityType, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { leadDiscoveryContactedSchema } from "@/lib/validations/lead-discovery";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = leadDiscoveryContactedSchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: payload.leadId },
      select: { id: true, companyId: true, status: true, title: true }
    });

    if (!lead) return apiError("Lead not found", 404);

    const nextStatus =
      lead.status === LeadStatus.CLOSED || lead.status === LeadStatus.DEAD ? lead.status : LeadStatus.CONTACTED;

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: { status: nextStatus },
      select: { id: true, status: true }
    });

    const note = payload.note || `Lead marked contacted via Lead Discovery: ${lead.title}`;
    await prisma.activity.create({
      data: {
        leadId: lead.id,
        companyId: lead.companyId,
        type: ActivityType.NOTE,
        note
      }
    });

    return apiOk(updatedLead);
  } catch (error) {
    return apiError(parseZodError(error), 400);
  }
}

