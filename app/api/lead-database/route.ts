import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { listLeadDatabaseEntries } from "@/lib/services/lead-database";
import { leadDatabaseListQuerySchema } from "@/lib/validations/lead-database";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = leadDatabaseListQuerySchema.parse({
      q: searchParams.get("q") || "",
      product: searchParams.get("product") || "",
      role: searchParams.get("role") || undefined,
      tier: searchParams.get("tier") || undefined,
      country: searchParams.get("country") || "",
      source: searchParams.get("source") || "",
      confidence: searchParams.get("confidence") || undefined,
      has_contact: searchParams.get("has_contact") || undefined,
      has_email: searchParams.get("has_email") || undefined,
      has_phone: searchParams.get("has_phone") || undefined,
      has_volume: searchParams.get("has_volume") || undefined,
      limit: searchParams.get("limit") || undefined
    });

    const data = await listLeadDatabaseEntries({
      q: payload.q || undefined,
      product: payload.product || undefined,
      role: payload.role,
      tier: payload.tier,
      country: payload.country || undefined,
      source: payload.source || undefined,
      confidence: payload.confidence,
      has_contact: payload.has_contact,
      has_email: payload.has_email,
      has_phone: payload.has_phone,
      has_volume: payload.has_volume,
      limit: payload.limit
    });

    return apiOk(data);
  } catch (error) {
    if (error instanceof ZodError) return apiError(parseZodError(error), 400);
    return apiError(parseZodError(error), 500);
  }
}
