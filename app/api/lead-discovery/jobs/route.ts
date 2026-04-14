import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createSearchJob } from "@/lib/services/market-intelligence";
import { leadDiscoveryCreateJobSchema } from "@/lib/validations/lead-discovery";
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
    const payload = leadDiscoveryCreateJobSchema.parse(body);

    const data = await createSearchJob({
      query: payload.q,
      country: payload.country || null,
      intent: payload.intent || null,
      customSources: parseCustomSources(payload.customSources)
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) return apiError(parseZodError(error), 400);
    return apiError(parseZodError(error), 500);
  }
}

