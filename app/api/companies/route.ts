import { NextRequest } from "next/server";
import { CompanyStatus, CompanyType } from "@prisma/client";
import { listCompanies, createCompany } from "@/lib/services/companies";
import { companySchema } from "@/lib/validations/company";
import { apiError, apiOk, parseZodError } from "@/lib/utils/http";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyType = searchParams.get("companyType");
    const status = searchParams.get("status");
    const data = await listCompanies({
      q: searchParams.get("q") || "",
      country: searchParams.get("country") || "",
      companyType:
        companyType && Object.values(CompanyType).includes(companyType as CompanyType)
          ? (companyType as CompanyType)
          : "",
      status:
        status && Object.values(CompanyStatus).includes(status as CompanyStatus)
          ? (status as CompanyStatus)
          : ""
    });

    return apiOk(data);
  } catch (error) {
    return apiError(parseZodError(error), 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const payload = companySchema.parse(json);
    const company = await createCompany(payload);
    return apiOk(company);
  } catch (error) {
    return apiError(parseZodError(error));
  }
}
