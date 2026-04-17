import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createSearchJob } from "@/lib/services/market-intelligence";
import { marketIntelligenceCreateJobSchema } from "@/lib/validations/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

const parseCustomSources = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = marketIntelligenceCreateJobSchema.parse(body);
    const customSources = parseCustomSources(payload.customSources);

    console.info("[lead-discovery] incoming_query", {
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || "auto",
      customSourcesCount: customSources.length
    });

    const data = await createSearchJob({
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || null,
      maxSources: payload.maxSources,
      maxResultsPerSource: payload.maxResultsPerSource,
      customSources,
      savedSearchId: payload.savedSearchId || null
    });

    console.info("[lead-discovery] fresh_search_started", {
      query: payload.q,
      jobId: data.job_id,
      status: data.status
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) return apiError(parseZodError(error), 400);
    return apiError(parseZodError(error), 500);
  }
}
