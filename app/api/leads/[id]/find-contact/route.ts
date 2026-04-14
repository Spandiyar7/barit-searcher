import { NextRequest } from "next/server";
import { enrichLeadContactsById } from "@/lib/services/market-intelligence/import";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

type Context = {
  params: {
    id: string;
  };
};

export async function POST(_: NextRequest, context: Context) {
  try {
    const data = await enrichLeadContactsById(context.params.id);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

