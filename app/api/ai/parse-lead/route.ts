import { NextRequest } from "next/server";
import { aiProvider, parseLeadText } from "@/lib/ai";
import { findProductByNameOrSynonym } from "@/lib/services/products";
import { aiRawLeadSchema } from "@/lib/validations/ai";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = aiRawLeadSchema.parse(json);

    const parsed = await parseLeadText(payload.rawText);
    const matchedProduct = await findProductByNameOrSynonym(parsed.productName);

    return apiOk({
      parsed,
      matchedProduct,
      ai: {
        provider: aiProvider.name,
        configured: aiProvider.configured
      }
    });
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
