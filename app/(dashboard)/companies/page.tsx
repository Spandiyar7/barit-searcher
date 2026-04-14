import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { listCompanies } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CompanyStatusBadge, CompanyTypeBadge } from "@/components/ui/entity-badges";
import { CompanyStatus, CompanyType } from "@prisma/client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function CompaniesPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    country: typeof searchParams.country === "string" ? searchParams.country : "",
    companyType: (typeof searchParams.companyType === "string" ? searchParams.companyType : "") as
      | CompanyType
      | "",
    status: (typeof searchParams.status === "string" ? searchParams.status : "") as CompanyStatus | ""
  };

  const [companies, countryRows] = await Promise.all([
    listCompanies(filters),
    prisma.company.findMany({
      select: { country: true },
      distinct: ["country"],
      orderBy: { country: "asc" }
    })
  ]);

  const countries = countryRows.map((row) => row.country);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("companies.title")}
        description={t("companies.description")}
        actionHref="/companies/new"
        actionLabel={t("companies.add")}
      />

      <Card>
        <form className="grid gap-3 md:grid-cols-5">
          <Input name="q" defaultValue={filters.q} placeholder={t("companies.searchPlaceholder")} />
          <Select name="country" defaultValue={filters.country}>
            <option value="">{t("companies.allCountries")}</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </Select>
          <Select name="companyType" defaultValue={filters.companyType}>
            <option value="">{t("companies.allTypes")}</option>
            {Object.values(CompanyType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={filters.status}>
            <option value="">{t("companies.allStatuses")}</option>
            {Object.values(CompanyStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <button className="rounded-lg bg-primary px-4 text-sm font-semibold text-white" type="submit">
            {t("common.filter")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {companies.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("companies.emptyTitle")}
              description={t("companies.emptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("companies.company")}</TH>
                  <TH>{t("common.type")}</TH>
                  <TH>{t("common.location")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("companies.contacts")}</TH>
                  <TH>{t("companies.leads")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {companies.map((company) => (
                  <TR key={company.id}>
                    <TD>
                      <div>
                        <p className="font-medium text-slate-800">{company.name}</p>
                        <p className="text-xs text-slate-500">{company.website || company.source || "-"}</p>
                      </div>
                    </TD>
                    <TD>
                      <CompanyTypeBadge type={company.companyType} />
                    </TD>
                    <TD>
                      {company.country} / {company.city}
                    </TD>
                    <TD>
                      <CompanyStatusBadge status={company.status} />
                    </TD>
                    <TD>{company._count.contacts}</TD>
                    <TD>{company._count.leads}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
                          {t("common.view")}
                        </Link>
                        <Link href={`/companies/${company.id}/edit`} className="text-sm text-slate-600 hover:underline">
                          {t("common.edit")}
                        </Link>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
