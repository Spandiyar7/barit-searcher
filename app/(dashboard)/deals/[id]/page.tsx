import Link from "next/link";
import { notFound } from "next/navigation";
import { getDealById } from "@/lib/services/deals";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { DealStageBadge } from "@/components/ui/entity-badges";
import { DeleteButton } from "@/components/ui/delete-button";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ActivityForm } from "@/components/activities/activity-form";
import { fmtMoney, fmtNumber } from "@/lib/utils/format";

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const deal = await getDealById(params.id);
  if (!deal) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Deal ${deal.id.slice(0, 8)}`} description={deal.product.name} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3 xl:col-span-2">
          <DealStageBadge stage={deal.stage} />
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Product:</span> {deal.product.name}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Seller:</span>{" "}
            {deal.sellerCompany ? (
              <Link href={`/companies/${deal.sellerCompany.id}`} className="text-primary hover:underline">
                {deal.sellerCompany.name}
              </Link>
            ) : (
              "-"
            )}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Buyer:</span>{" "}
            {deal.buyerCompany ? (
              <Link href={`/companies/${deal.buyerCompany.id}`} className="text-primary hover:underline">
                {deal.buyerCompany.name}
              </Link>
            ) : (
              "-"
            )}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Volume:</span> {fmtNumber(deal.volume?.toString())} {deal.unit || ""}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Price:</span> {fmtMoney(deal.price?.toString(), deal.currency || "USD")}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Incoterms:</span> {deal.incoterms || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Route:</span> {deal.originCountry || "-"} {"->"}{" "}
            {deal.destinationCountry || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Source Lead:</span>{" "}
            {deal.sourceLead ? (
              <Link href={`/leads/${deal.sourceLead.id}`} className="text-primary hover:underline">
                {deal.sourceLead.title}
              </Link>
            ) : (
              "-"
            )}
          </p>
          <div className="flex gap-2">
            <Link href={`/deals/${deal.id}/edit`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Edit
            </Link>
            <DeleteButton endpoint={`/api/deals/${deal.id}`} redirectTo="/deals" />
          </div>
        </Card>

        <Card>
          <CardTitle>Notes</CardTitle>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{deal.notes || "No notes"}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Activity Timeline</CardTitle>
          <div className="mt-3">
            <ActivityTimeline activities={deal.activities} />
          </div>
        </Card>
        <Card>
          <CardTitle>Add Activity</CardTitle>
          <div className="mt-3">
            <ActivityForm dealId={deal.id} />
          </div>
        </Card>
      </div>
    </div>
  );
}
