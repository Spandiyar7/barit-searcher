import { NextRequest } from "next/server";
import { createSavedSearch, listSavedSearches } from "@/lib/services/market-intelligence";
import { marketIntelligenceSavedSearchSchema } from "@/lib/validations/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";
import { ZodError } from "zod";

const parseCustomSources = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

export async function GET() {
  try {
    const data = await listSavedSearches();
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = marketIntelligenceSavedSearchSchema.parse(body);

    const data = await createSavedSearch({
      name: payload.name,
      keyword: payload.keyword,
      country: payload.country || null,
      intent: payload.intent || null,
      customSources: parseCustomSources(payload.customSources),
      frequencyHours: payload.frequencyHours,
      isActive: payload.isActive
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(parseZodError(error), 400);
    }
    return apiError(parseZodError(error), 500);
  }
}
