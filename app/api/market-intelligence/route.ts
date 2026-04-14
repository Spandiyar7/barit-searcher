import { NextRequest } from "next/server";
import { createSearchJob, runMarketIntelligenceSearch } from "@/lib/services/market-intelligence";
import { marketIntelligenceCreateJobSchema, marketIntelligenceQuerySchema } from "@/lib/validations/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";
import { ZodError } from "zod";

const parseCustomSources = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const payload = marketIntelligenceQuerySchema.parse({
      q: searchParams.get("q") || "",
      country: searchParams.get("country") || "",
      intent: searchParams.get("intent") || undefined,
      maxSources: searchParams.get("maxSources") || undefined,
      maxResultsPerSource: searchParams.get("maxResultsPerSource") || undefined,
      customSources: searchParams.get("customSources") || ""
    });

    const data = await runMarketIntelligenceSearch({
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || null,
      maxSources: payload.maxSources,
      maxResultsPerSource: payload.maxResultsPerSource,
      customSources: parseCustomSources(payload.customSources)
    });

    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = marketIntelligenceCreateJobSchema.parse(body);

    const data = await createSearchJob({
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || null,
      maxSources: payload.maxSources,
      maxResultsPerSource: payload.maxResultsPerSource,
      customSources: parseCustomSources(payload.customSources),
      savedSearchId: payload.savedSearchId || null
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) {
      return apiError(parseZodError(error), 400);
    }
    return apiError(parseZodError(error), 500);
  }
}
