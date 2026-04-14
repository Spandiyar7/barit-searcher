import { NextRequest } from "next/server";
import { deleteProduct, getProductById, updateProduct } from "@/lib/services/products";
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

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getProductById(params.id);
    if (!data) return apiError("Product not found", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = productSchema.parse({
      ...json,
      synonyms: parseSynonyms(json.synonyms)
    });
    const data = await updateProduct(params.id, payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteProduct(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
