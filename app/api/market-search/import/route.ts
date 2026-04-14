import { NextRequest } from "next/server";
import { importGo4WorldBusinessLead } from "@/lib/services/market-search/go4worldbusiness";
import { marketSearchImportSchema } from "@/lib/validations/market-search";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = marketSearchImportSchema.parse(json);
    const data = await importGo4WorldBusinessLead(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
