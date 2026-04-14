import Link from "next/link";
import { LeadPriority, LeadStatus, LeadType } from "@prisma/client";
import { listLeads } from "@/lib/services/leads";
import { getProductOptions } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LeadPriorityBadge, LeadStatusBadge, LeadTypeBadge } from "@/components/ui/entity-badges";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    productId: typeof searchParams.productId === "string" ? searchParams.productId : "",
    leadType: (typeof searchParams.leadType === "string" ? searchParams.leadType : "") as LeadType | "",
    originCountry: typeof searchParams.originCountry === "string" ? searchParams.originCountry : "",
    destinationCountry: typeof searchParams.destinationCountry === "string" ? searchParams.destinationCountry : "",
    status: (typeof searchParams.status === "string" ? searchParams.status : "") as LeadStatus | "",
    priority: (typeof searchParams.priority === "string" ? searchParams.priority : "") as LeadPriority | ""
  };

  const [leads, products] = await Promise.all([listLeads(filters), getProductOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("leads.title")}
        description={t("leads.description")}
        actionHref="/leads/new"
        actionLabel={t("leads.add")}
      />

      <Card>
        <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Input name="q" defaultValue={filters.q} placeholder={t("leads.searchPlaceholder")} />
          <Select name="productId" defaultValue={filters.productId}>
            <option value="">{t("leads.allProducts")}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Select name="leadType" defaultValue={filters.leadType}>
            <option value="">{t("leads.allTypes")}</option>
            {Object.values(LeadType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Input name="originCountry" defaultValue={filters.originCountry} placeholder={t("leads.originCountry")} />
          <Input
            name="destinationCountry"
            defaultValue={filters.destinationCountry}
            placeholder={t("leads.destinationCountry")}
          />
          <Select name="status" defaultValue={filters.status}>
            <option value="">{t("leads.allStatuses")}</option>
            {Object.values(LeadStatus).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <Select name="priority" defaultValue={filters.priority}>
            <option value="">{t("leads.allPriorities")}</option>
            {Object.values(LeadPriority).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white md:col-span-4 xl:col-span-7" type="submit">
            {t("common.applyFilters")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {leads.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("leads.emptyTitle")}
              description={t("leads.emptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("dashboard.leadLabel")}</TH>
                  <TH>{t("common.product")}</TH>
                  <TH>{t("leads.counterparty")}</TH>
                  <TH>{t("common.type")}</TH>
                  <TH>{t("common.priority")}</TH>
                  <TH>{t("common.status")}</TH>
                  <TH>{t("common.route")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {leads.map((lead) => (
                  <TR key={lead.id}>
                    <TD>
                      <p className="font-medium text-slate-800">{lead.title}</p>
                      <p className="text-xs text-slate-500">{lead.sourceName}</p>
                    </TD>
                    <TD>{lead.product.name}</TD>
                    <TD>{lead.company?.name || "-"}</TD>
                    <TD>
                      <LeadTypeBadge type={lead.leadType} />
                    </TD>
                    <TD>
                      <LeadPriorityBadge priority={lead.priority} />
                    </TD>
                    <TD>
                      <LeadStatusBadge status={lead.status} />
                    </TD>
                    <TD>
                      {(lead.originCountry || "-") + " -> " + (lead.destinationCountry || "-")}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/leads/${lead.id}`} className="text-sm text-primary hover:underline">
                          {t("common.view")}
                        </Link>
                        <Link href={`/leads/${lead.id}/edit`} className="text-sm text-slate-600 hover:underline">
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
