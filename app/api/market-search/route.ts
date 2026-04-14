import { NextRequest } from "next/server";
import { searchGo4WorldBusiness } from "@/lib/services/market-search/go4worldbusiness";
import { marketSearchQuerySchema } from "@/lib/validations/market-search";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payload = marketSearchQuerySchema.parse({
      keyword: searchParams.get("keyword") || "",
      mode: searchParams.get("mode") || "buyers",
      country: searchParams.get("country") || ""
    });

    const data = await searchGo4WorldBusiness(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
