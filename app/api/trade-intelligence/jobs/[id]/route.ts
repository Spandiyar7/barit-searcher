import { NextRequest } from "next/server";
import { getTradeIntelligenceSnapshot } from "@/lib/services/trade-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_: NextRequest, context: Context) {
  try {
    const data = await getTradeIntelligenceSnapshot(context.params.id);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

