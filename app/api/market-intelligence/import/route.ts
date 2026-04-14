import { NextRequest } from "next/server";
import { importMarketIntelligenceLead } from "@/lib/services/market-intelligence";
import { marketIntelligenceImportSchema } from "@/lib/validations/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = marketIntelligenceImportSchema.parse(body);
    const data = await importMarketIntelligenceLead(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
