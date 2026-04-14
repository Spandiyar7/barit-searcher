import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createSearchJob } from "@/lib/services/market-intelligence";
import { leadDatabaseCreateJobSchema } from "@/lib/validations/lead-database";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

const parseCustomSources = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = leadDatabaseCreateJobSchema.parse(body);

    const data = await createSearchJob({
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || null,
      customSources: parseCustomSources(payload.customSources),
      maxSources: 8,
      maxResultsPerSource: 25
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) return apiError(parseZodError(error), 400);
    return apiError(parseZodError(error), 500);
  }
}
