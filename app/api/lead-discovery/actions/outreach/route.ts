import { NextRequest } from "next/server";
import { summarizeLead, suggestNextActions } from "@/lib/ai";
import { prisma } from "@/lib/db/prisma";
import { leadDiscoveryOutreachSchema } from "@/lib/validations/lead-discovery";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = leadDiscoveryOutreachSchema.parse(body);

    const lead = await prisma.lead.findUnique({
      where: { id: payload.leadId },
      include: {
        product: true,
        company: {
          include: {
            contacts: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    });

    if (!lead) return apiError("Lead not found", 404);

    const summary = await summarizeLead({
      title: lead.title,
      rawText: lead.rawText,
      product: lead.product.name,
      leadType: lead.leadType,
      volume: lead.volume ? Number(lead.volume) : null,
      unit: lead.unit || undefined,
      price: lead.price ? Number(lead.price) : null,
      currency: lead.currency || undefined,
      incoterms: lead.incoterms || undefined,
      originCountry: lead.originCountry || undefined,
      destinationCountry: lead.destinationCountry || undefined
    });

    const actions = await suggestNextActions({
      title: lead.title,
      rawText: lead.rawText,
      product: lead.product.name,
      leadType: lead.leadType,
      volume: lead.volume ? Number(lead.volume) : null,
      unit: lead.unit || undefined,
      price: lead.price ? Number(lead.price) : null,
      currency: lead.currency || undefined,
      incoterms: lead.incoterms || undefined,
      originCountry: lead.originCountry || undefined,
      destinationCountry: lead.destinationCountry || undefined
    });

    const contact = lead.company?.contacts[0];
    const opening = contact?.fullName ? `Hello ${contact.fullName},` : "Hello,";
    const companyName = lead.company?.name || "your team";
    const bodyText = [
      opening,
      "",
      `We are reaching out regarding ${lead.product.name} opportunities with ${companyName}.`,
      summary,
      actions[0] ? `Proposed next step: ${actions[0]}` : "",
      "",
      "If relevant, we can share pricing options and confirm logistics terms.",
      "",
      "Best regards,"
    ]
      .filter(Boolean)
      .join("\n");

    return apiOk({
      leadId: lead.id,
      subject: `${lead.product.name} opportunity`,
      message: bodyText
    });
  } catch (error) {
    return apiError(parseZodError(error), 400);
  }
}
