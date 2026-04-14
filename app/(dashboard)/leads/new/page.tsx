import { getCompanyOptions } from "@/lib/services/companies";
import { getProductOptions } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { LeadForm } from "@/components/leads/lead-form";

export default async function NewLeadPage() {
  const [products, companies] = await Promise.all([getProductOptions(), getCompanyOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader title="Add Lead" description="Capture inquiry with structured fields or AI-assisted parsing" />
      <LeadForm products={products} companies={companies} />
    </div>
  );
}
