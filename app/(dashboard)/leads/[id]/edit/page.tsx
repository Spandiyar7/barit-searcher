import { notFound } from "next/navigation";
import { getLeadById } from "@/lib/services/leads";
import { getCompanyOptions } from "@/lib/services/companies";
import { getProductOptions } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { LeadForm } from "@/components/leads/lead-form";

export default async function EditLeadPage({ params }: { params: { id: string } }) {
  const [lead, products, companies] = await Promise.all([
    getLeadById(params.id),
    getProductOptions(),
    getCompanyOptions()
  ]);

  if (!lead) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${lead.title}`} description="Update lead details" />
      <LeadForm
        products={products}
        companies={companies}
        initialData={{
          id: lead.id,
          title: lead.title,
          productId: lead.productId,
          companyId: lead.companyId || "",
          leadType: lead.leadType,
          volume: lead.volume?.toString() || "",
          unit: lead.unit || "",
          price: lead.price?.toString() || "",
          currency: lead.currency || "",
          incoterms: lead.incoterms || "",
          originCountry: lead.originCountry || "",
          destinationCountry: lead.destinationCountry || "",
          sourceName: lead.sourceName,
          sourceUrl: lead.sourceUrl || "",
          rawText: lead.rawText,
          aiSummary: lead.aiSummary || "",
          priority: lead.priority,
          status: lead.status,
          publishedAt: lead.publishedAt ? new Date(lead.publishedAt).toISOString().slice(0, 16) : ""
        }}
      />
    </div>
  );
}
