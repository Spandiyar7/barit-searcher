import { notFound } from "next/navigation";
import { getDealById } from "@/lib/services/deals";
import { getCompanyOptions } from "@/lib/services/companies";
import { getProductOptions } from "@/lib/services/products";
import { getLeadOptions } from "@/lib/services/leads";
import { PageHeader } from "@/components/ui/page-header";
import { DealForm } from "@/components/deals/deal-form";

export default async function EditDealPage({ params }: { params: { id: string } }) {
  const [deal, products, companies, leads] = await Promise.all([
    getDealById(params.id),
    getProductOptions(),
    getCompanyOptions(),
    getLeadOptions()
  ]);

  if (!deal) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit Deal ${deal.id.slice(0, 8)}`} description="Update deal parameters" />
      <DealForm
        products={products}
        companies={companies}
        leads={leads}
        initialData={{
          id: deal.id,
          productId: deal.productId,
          sourceLeadId: deal.sourceLeadId || "",
          sellerCompanyId: deal.sellerCompanyId || "",
          buyerCompanyId: deal.buyerCompanyId || "",
          volume: deal.volume?.toString() || "",
          unit: deal.unit || "",
          price: deal.price?.toString() || "",
          currency: deal.currency || "",
          incoterms: deal.incoterms || "",
          originCountry: deal.originCountry || "",
          destinationCountry: deal.destinationCountry || "",
          stage: deal.stage,
          notes: deal.notes || ""
        }}
      />
    </div>
  );
}
