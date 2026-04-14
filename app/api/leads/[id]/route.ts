import { NextRequest } from "next/server";
import { deleteLead, getLeadById, updateLead } from "@/lib/services/leads";
import { leadSchema } from "@/lib/validations/lead";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getLeadById(params.id);
    if (!data) return apiError("Lead not found", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = leadSchema.parse(json);
    const data = await updateLead(params.id, payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteLead(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
