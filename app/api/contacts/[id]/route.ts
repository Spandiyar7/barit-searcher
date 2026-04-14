import { NextRequest } from "next/server";
import { deleteContact, getContactById, updateContact } from "@/lib/services/contacts";
import { contactSchema } from "@/lib/validations/contact";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getContactById(params.id);
    if (!data) return apiError("Contact not found", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = contactSchema.parse(json);
    const data = await updateContact(params.id, payload);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteContact(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
