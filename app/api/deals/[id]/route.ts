import { NextRequest } from "next/server";
import { deleteDeal, getDealById, updateDeal } from "@/lib/services/deals";
import { dealSchema } from "@/lib/validations/deal";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getDealById(params.id);
    if (!data) return apiError("Deal not found", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = dealSchema.parse(json);
    const data = await updateDeal(params.id, payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteDeal(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
