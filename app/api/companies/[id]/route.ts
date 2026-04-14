import { NextRequest } from "next/server";
import { getCompanyById, updateCompany, deleteCompany } from "@/lib/services/companies";
import { companySchema } from "@/lib/validations/company";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getCompanyById(params.id);
    if (!data) return apiError("Company not found", 404);
    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const json = await request.json();
    const payload = companySchema.parse(json);
    const company = await updateCompany(params.id, payload);
    return apiOk(company);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteCompany(params.id);
    return apiOk({ success: true });
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}
