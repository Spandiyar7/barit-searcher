import { NextRequest } from "next/server";
import { createContact, listContacts } from "@/lib/services/contacts";
import { contactSchema } from "@/lib/validations/contact";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await listContacts({
      q: searchParams.get("q") || "",
      companyId: searchParams.get("companyId") || ""
    });
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = contactSchema.parse(json);
    const data = await createContact(payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
