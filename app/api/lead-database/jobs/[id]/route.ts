import { NextRequest } from "next/server";
import { getLeadDatabaseSnapshot } from "@/lib/services/lead-database";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_: NextRequest, context: Context) {
  try {
    const data = await getLeadDatabaseSnapshot(context.params.id);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
