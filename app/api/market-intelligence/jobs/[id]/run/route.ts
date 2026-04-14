import { NextRequest } from "next/server";
import { ensureSearchJobRunning, getSearchJobSnapshot } from "@/lib/services/market-intelligence";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(_: NextRequest, context: Context) {
  try {
    await ensureSearchJobRunning(context.params.id);
    const data = await getSearchJobSnapshot(context.params.id);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
