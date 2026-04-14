import { NextRequest } from "next/server";
import { promoteRawMarketLead } from "@/lib/services/raw-market-leads";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      saveCompany?: boolean;
    };
    const data = await promoteRawMarketLead(params.id, payload.saveCompany ?? true);
    return apiOk(data);
  } catch (error) {
    const message = parseZodError(error);
    if (message.toLowerCase().includes("not found")) return apiError(message, 404);
    return apiError(message, 500);
  }
}
