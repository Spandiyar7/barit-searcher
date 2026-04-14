import { NextRequest } from "next/server";
import { createProduct, listProducts } from "@/lib/services/products";
import { productSchema } from "@/lib/validations/product";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

const parseSynonyms = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await listProducts({
      q: searchParams.get("q") || "",
      category: searchParams.get("category") || ""
    });
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = productSchema.parse({
      ...json,
      synonyms: parseSynonyms(json.synonyms)
    });
    const data = await createProduct(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
