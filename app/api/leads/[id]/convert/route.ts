import { NextRequest } from "next/server";
import { convertLeadToDeal } from "@/lib/services/leads";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deal = await convertLeadToDeal(params.id);
    return apiOk(deal);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
