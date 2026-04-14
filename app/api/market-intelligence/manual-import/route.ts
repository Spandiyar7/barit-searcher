import { NextRequest } from "next/server";
import { manualImportMarketLead } from "@/lib/services/market-intelligence";
import { marketIntelligenceManualImportSchema } from "@/lib/validations/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";
import { ZodError } from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = marketIntelligenceManualImportSchema.parse(body);
    const data = await manualImportMarketLead(payload);
    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(parseZodError(error), 400);
    }
    return apiError(parseZodError(error), 500);
  }
}
