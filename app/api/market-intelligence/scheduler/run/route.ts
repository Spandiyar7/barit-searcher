import { NextRequest } from "next/server";
import { runDueSavedSearches } from "@/lib/services/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret");
    const configured = process.env.MARKET_INTEL_CRON_SECRET || "";

    if (configured && secret !== configured) {
      return apiError("Unauthorized", 401);
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") || "5");
    const data = await runDueSavedSearches(limit);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
