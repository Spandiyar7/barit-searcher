import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadById } from "@/lib/services/leads";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { LeadPriorityBadge, LeadStatusBadge, LeadTypeBadge } from "@/components/ui/entity-badges";
import { DeleteButton } from "@/components/ui/delete-button";
import { ConvertToDealButton } from "@/components/leads/convert-to-deal-button";
import { FindContactButton } from "@/components/leads/find-contact-button";
import { LeadNextActions } from "@/components/leads/lead-next-actions";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ActivityForm } from "@/components/activities/activity-form";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/utils/format";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { inferImportMode, inferSourceKind } from "@/lib/services/market-intelligence/source-origin";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const locale = getLocale();
  const t = getTranslator(locale);
  const lead = await getLeadById(params.id);
  if (!lead) notFound();

  const rawNormalized =
    lead.rawMarketLeads[0]?.normalized && typeof lead.rawMarketLeads[0].normalized === "object" && !Array.isArray(lead.rawMarketLeads[0].normalized)
      ? (lead.rawMarketLeads[0].normalized as Record<string, unknown>)
      : null;
  const sourceKind = inferSourceKind({
    sourceName: lead.sourceName,
    sourceUrl: lead.sourceUrl,
    rawText: lead.rawText,
    sourceKind: typeof rawNormalized?.source_kind === "string" ? rawNormalized.source_kind : null
  });
  const importMode = inferImportMode({
    sourceName: lead.sourceName,
    sourceUrl: lead.sourceUrl,
    rawText: lead.rawText,
    sourceKind: typeof rawNormalized?.source_kind === "string" ? rawNormalized.source_kind : null,
    importMode: typeof rawNormalized?.import_mode === "string" ? rawNormalized.import_mode : null
  });

  const promotedFromRawLead = lead.rawMarketLeads.length > 0;
  const hasCompanyWebsite = Boolean(lead.company?.website);
  const hasUsefulContact = Boolean(
    lead.company?.contacts.some((contact) => Boolean(contact.email || contact.phone || contact.fullName))
  );
  const enrichmentStatus = hasCompanyWebsite && hasUsefulContact
    ? t("leads.enriched")
    : hasCompanyWebsite || hasUsefulContact
      ? t("leads.partialEnrichment")
      : t("leads.notEnriched");

  return (
    <div className="space-y-6">
      <PageHeader title={lead.title} description={`${lead.product.name} / ${lead.sourceName}`} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <LeadTypeBadge type={lead.leadType} />
            <LeadStatusBadge status={lead.status} />
            <LeadPriorityBadge priority={lead.priority} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Product:</span> {lead.product.name}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Company:</span>{" "}
              {lead.company ? (
                <Link href={`/companies/${lead.company.id}`} className="text-primary hover:underline">
                  {lead.company.name}
                </Link>
              ) : (
                "Unlinked"
              )}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Volume:</span> {fmtNumber(lead.volume?.toString())} {lead.unit || ""}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Price:</span>{" "}
              {fmtMoney(lead.price?.toString(), lead.currency || "USD")}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Incoterms:</span> {lead.incoterms || "-"}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Route:</span> {lead.originCountry || "-"} {"->"}{" "}
              {lead.destinationCountry || "-"}
            </p>
            <p className="text-sm text-slate-600 md:col-span-2">
              <span className="font-medium text-slate-800">{t("leads.sourceName")}:</span> {lead.sourceName}
            </p>
            <p className="text-sm text-slate-600 md:col-span-2">
              <span className="font-medium text-slate-800">{t("leads.sourceUrl")}:</span>{" "}
              {lead.sourceUrl ? (
                <Link href={lead.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {lead.sourceUrl}
                </Link>
              ) : (
                "-"
              )}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{t("leads.promotedFromRawLead")}:</span>{" "}
              {promotedFromRawLead ? t("leads.yes") : t("leads.no")}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{t("leads.sourceKind")}:</span> {t(`sourceKind.${sourceKind}`)}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{t("leads.importMode")}:</span> {t(`importMode.${importMode}`)}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{t("leads.enrichmentStatus")}:</span> {enrichmentStatus}
            </p>
            <p className="text-xs text-slate-500 md:col-span-2">Published: {fmtDate(lead.publishedAt)}</p>
            <div className="md:col-span-2">
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-800">{t("leads.relatedContacts")}:</span>
              </p>
              {lead.company?.contacts.length ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {lead.company.contacts.map((contact) => (
                    <Link
                      key={contact.id}
                      href={`/contacts/${contact.id}`}
                      className="rounded-full border border-border px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {contact.fullName}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">-</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/leads/${lead.id}/edit`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Edit
            </Link>
            <ConvertToDealButton leadId={lead.id} />
            <FindContactButton
              leadId={lead.id}
              idleLabel={t("leads.findContact")}
              loadingLabel={t("leads.findingContact")}
              successLabel={t("leads.findContactDone")}
              errorLabel={t("leads.findContactError")}
            />
            {lead.sourceDeal ? (
              <Link href={`/deals/${lead.sourceDeal.id}`} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold">
                Open Deal
              </Link>
            ) : null}
            <DeleteButton endpoint={`/api/leads/${lead.id}`} redirectTo="/leads" />
          </div>
        </Card>

        <Card>
          <CardTitle>Next Actions</CardTitle>
          <div className="mt-3">
            <LeadNextActions
              context={{
                title: lead.title,
                rawText: lead.rawText,
                product: lead.product.name,
                leadType: lead.leadType,
                volume: lead.volume?.toString() || null,
                unit: lead.unit,
                price: lead.price?.toString() || null,
                currency: lead.currency,
                incoterms: lead.incoterms,
                originCountry: lead.originCountry,
                destinationCountry: lead.destinationCountry
              }}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>AI Summary</CardTitle>
        <p className="mt-3 text-sm text-slate-700">{lead.aiSummary || "No AI summary yet."}</p>
      </Card>

      <Card>
        <CardTitle>Raw Text</CardTitle>
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs text-slate-100">{lead.rawText}</pre>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Activity Timeline</CardTitle>
          <div className="mt-3">
            <ActivityTimeline activities={lead.activities} />
          </div>
        </Card>
        <Card>
          <CardTitle>Add Activity</CardTitle>
          <div className="mt-3">
            <ActivityForm leadId={lead.id} companyId={lead.companyId || undefined} />
          </div>
        </Card>
      </div>
    </div>
  );
}
