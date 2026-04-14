import { getCompanyOptions } from "@/lib/services/companies";
import { getProductOptions } from "@/lib/services/products";
import { getLeadOptions } from "@/lib/services/leads";
import { PageHeader } from "@/components/ui/page-header";
import { DealForm } from "@/components/deals/deal-form";

export default async function NewDealPage() {
  const [products, companies, leads] = await Promise.all([
    getProductOptions(),
    getCompanyOptions(),
    getLeadOptions()
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Add Deal" description="Create negotiation workflow with buyer and seller linkage" />
      <DealForm products={products} companies={companies} leads={leads} />
    </div>
  );
}
