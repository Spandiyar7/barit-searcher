import { NextRequest } from "next/server";
import { LeadPriority, LeadStatus, LeadType } from "@prisma/client";
import { createLead, listLeads } from "@/lib/services/leads";
import { leadSchema } from "@/lib/validations/lead";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadType = searchParams.get("leadType");
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const data = await listLeads({
      q: searchParams.get("q") || "",
      productId: searchParams.get("productId") || "",
      leadType:
        leadType && Object.values(LeadType).includes(leadType as LeadType)
          ? (leadType as LeadType)
          : "",
      originCountry: searchParams.get("originCountry") || "",
      destinationCountry: searchParams.get("destinationCountry") || "",
      status:
        status && Object.values(LeadStatus).includes(status as LeadStatus)
          ? (status as LeadStatus)
          : "",
      priority:
        priority && Object.values(LeadPriority).includes(priority as LeadPriority)
          ? (priority as LeadPriority)
          : ""
    });
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = leadSchema.parse(json);
    const data = await createLead(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
