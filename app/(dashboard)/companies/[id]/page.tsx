import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { CompanyStatusBadge, CompanyTypeBadge, LeadStatusBadge, LeadTypeBadge } from "@/components/ui/entity-badges";
import { DeleteButton } from "@/components/ui/delete-button";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ActivityForm } from "@/components/activities/activity-form";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/utils/format";

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const company = await getCompanyById(params.id);
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={company.name} description={`${company.country} / ${company.city}`} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <CompanyTypeBadge type={company.companyType} />
            <CompanyStatusBadge status={company.status} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Website:</span> {company.website || "-"}
            </p>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Source:</span> {company.source || "-"}
            </p>
            <p className="text-sm text-slate-600 md:col-span-2">
              <span className="font-medium text-slate-800">Description:</span> {company.description || "-"}
            </p>
            <p className="text-xs text-slate-500">Created: {fmtDate(company.createdAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/companies/${company.id}/edit`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Edit
            </Link>
            <DeleteButton endpoint={`/api/companies/${company.id}`} redirectTo="/companies" />
          </div>
        </Card>

        <Card>
          <CardTitle>Quick Stats</CardTitle>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Contacts: {company.contacts.length}</p>
            <p>Leads: {company.leads.length}</p>
            <p>Deals as Seller: {company.sellerDeals.length}</p>
            <p>Deals as Buyer: {company.buyerDeals.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Related Contacts</CardTitle>
          <div className="mt-3 space-y-2">
            {company.contacts.length === 0 ? (
              <p className="text-sm text-slate-500">No contacts linked yet.</p>
            ) : (
              company.contacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">{contact.fullName}</p>
                  <p className="text-xs text-slate-500">{contact.position || "No position"}</p>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Related Leads</CardTitle>
          <div className="mt-3 space-y-2">
            {company.leads.length === 0 ? (
              <p className="text-sm text-slate-500">No leads linked yet.</p>
            ) : (
              company.leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">{lead.title}</p>
                  <p className="text-xs text-slate-500">{lead.product.name}</p>
                  <div className="mt-2 flex gap-2">
                    <LeadTypeBadge type={lead.leadType} />
                    <LeadStatusBadge status={lead.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Deals</CardTitle>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {company.sellerDeals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`} className="rounded-lg border border-border p-3 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">Sell {deal.product.name}</p>
              <p className="text-xs text-slate-500">
                {fmtNumber(deal.volume?.toString())} {deal.unit || ""} @{" "}
                {fmtMoney(deal.price?.toString(), deal.currency || "USD")}
              </p>
            </Link>
          ))}
          {company.buyerDeals.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`} className="rounded-lg border border-border p-3 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">Buy {deal.product.name}</p>
              <p className="text-xs text-slate-500">
                {fmtNumber(deal.volume?.toString())} {deal.unit || ""} @{" "}
                {fmtMoney(deal.price?.toString(), deal.currency || "USD")}
              </p>
            </Link>
          ))}
          {company.sellerDeals.length + company.buyerDeals.length === 0 ? (
            <p className="text-sm text-slate-500">No deals linked yet.</p>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Activity Timeline</CardTitle>
          <div className="mt-3">
            <ActivityTimeline activities={company.activities} />
          </div>
        </Card>
        <Card>
          <CardTitle>Add Activity</CardTitle>
          <div className="mt-3">
            <ActivityForm companyId={company.id} />
          </div>
        </Card>
      </div>
    </div>
  );
}
