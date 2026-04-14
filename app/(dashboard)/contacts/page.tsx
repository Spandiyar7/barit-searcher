import Link from "next/link";
import { listContacts } from "@/lib/services/contacts";
import { getCompanyOptions } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function ContactsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    companyId: typeof searchParams.companyId === "string" ? searchParams.companyId : ""
  };

  const [contacts, companies] = await Promise.all([listContacts(filters), getCompanyOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        actionHref="/contacts/new"
        actionLabel={t("contacts.add")}
      />

      <Card>
        <form className="grid gap-3 md:grid-cols-3">
          <Input name="q" defaultValue={filters.q} placeholder={t("contacts.searchPlaceholder")} />
          <Select name="companyId" defaultValue={filters.companyId}>
            <option value="">{t("contacts.allCompanies")}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </Select>
          <button className="rounded-lg bg-primary px-4 text-sm font-semibold text-white" type="submit">
            {t("common.filter")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {contacts.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("contacts.emptyTitle")}
              description={t("contacts.emptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("common.contact")}</TH>
                  <TH>{t("common.company")}</TH>
                  <TH>{t("contacts.position")}</TH>
                  <TH>{t("contacts.email")}</TH>
                  <TH>{t("contacts.phone")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {contacts.map((contact) => (
                  <TR key={contact.id}>
                    <TD>
                      <p className="font-medium text-slate-800">{contact.fullName}</p>
                      <p className="text-xs text-slate-500">{contact.telegram || contact.whatsapp || "-"}</p>
                    </TD>
                    <TD>
                      <Link href={`/companies/${contact.companyId}`} className="text-primary hover:underline">
                        {contact.company.name}
                      </Link>
                    </TD>
                    <TD>{contact.position || "-"}</TD>
                    <TD>{contact.email || "-"}</TD>
                    <TD>{contact.phone || contact.whatsapp || "-"}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/contacts/${contact.id}`} className="text-sm text-primary hover:underline">
                          {t("common.view")}
                        </Link>
                        <Link href={`/contacts/${contact.id}/edit`} className="text-sm text-slate-600 hover:underline">
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
