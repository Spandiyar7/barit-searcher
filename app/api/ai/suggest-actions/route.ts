import { NextRequest } from "next/server";
import { aiProvider, suggestNextActions } from "@/lib/ai";
import { leadSummarizeSchema } from "@/lib/validations/lead";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = leadSummarizeSchema.parse(json);
    const actions = await suggestNextActions(payload);

    return apiOk({
      actions,
      ai: {
        provider: aiProvider.name,
        configured: aiProvider.configured
      }
    });
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
