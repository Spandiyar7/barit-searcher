import { NextRequest } from "next/server";
import { DealStage } from "@prisma/client";
import { createDeal, listDeals } from "@/lib/services/deals";
import { dealSchema } from "@/lib/validations/deal";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage");
    const data = await listDeals({
      q: searchParams.get("q") || "",
      productId: searchParams.get("productId") || "",
      stage:
        stage && Object.values(DealStage).includes(stage as DealStage)
          ? (stage as DealStage)
          : "",
      originCountry: searchParams.get("originCountry") || "",
      destinationCountry: searchParams.get("destinationCountry") || ""
    });
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = dealSchema.parse(json);
    const data = await createDeal(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
