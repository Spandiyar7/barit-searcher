import { NextRequest } from "next/server";
import { runSavedSearchNow } from "@/lib/services/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(_: NextRequest, context: Context) {
  try {
    const data = await runSavedSearchNow(context.params.id);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
