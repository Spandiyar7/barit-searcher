import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductById } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { LeadStatusBadge, LeadTypeBadge, DealStageBadge } from "@/components/ui/entity-badges";
import { fmtMoney, fmtNumber } from "@/lib/utils/format";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={product.name} description={product.category} />

      <Card className="space-y-3">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">HS Code:</span> {product.hsCode || "-"}
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">Synonyms:</span>{" "}
          {product.synonyms.length ? product.synonyms.join(", ") : "-"}
        </p>
        <div>
          <p className="mb-1 text-sm font-medium text-slate-800">Specs JSON</p>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {product.specsJson ? JSON.stringify(product.specsJson, null, 2) : "{}"}
          </pre>
        </div>
        <div className="flex gap-2">
          <Link href={`/products/${product.id}/edit`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
            Edit
          </Link>
          <DeleteButton endpoint={`/api/products/${product.id}`} redirectTo="/products" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Linked Leads ({product.leads.length})</CardTitle>
          <div className="mt-3 space-y-2">
            {product.leads.length === 0 ? (
              <p className="text-sm text-slate-500">No leads linked yet.</p>
            ) : (
              product.leads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">{lead.title}</p>
                  <p className="text-xs text-slate-500">{lead.company?.name || "Unlinked company"}</p>
                  <div className="mt-2 flex gap-2">
                    <LeadTypeBadge type={lead.leadType} />
                    <LeadStatusBadge status={lead.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>Linked Deals ({product.deals.length})</CardTitle>
          <div className="mt-3 space-y-2">
            {product.deals.length === 0 ? (
              <p className="text-sm text-slate-500">No deals linked yet.</p>
            ) : (
              product.deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/deals/${deal.id}`}
                  className="block rounded-lg border border-border p-3 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-800">
                    {deal.sellerCompany?.name || "Unknown seller"} to {deal.buyerCompany?.name || "Unknown buyer"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtNumber(deal.volume?.toString())} {deal.unit || ""} @{" "}
                    {fmtMoney(deal.price?.toString(), deal.currency || "USD")}
                  </p>
                  <div className="mt-2">
                    <DealStageBadge stage={deal.stage} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
