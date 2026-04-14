import { NextRequest } from "next/server";
import { markRawMarketLeadDuplicate } from "@/lib/services/raw-market-leads";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await markRawMarketLeadDuplicate(params.id);
    return apiOk(data);
  } catch (error) {
    const message = parseZodError(error);
    if (message.toLowerCase().includes("not found")) return apiError(message, 404);
    return apiError(message, 500);
  }
}
