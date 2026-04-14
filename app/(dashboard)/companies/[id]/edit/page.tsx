import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { CompanyForm } from "@/components/companies/company-form";

export default async function EditCompanyPage({ params }: { params: { id: string } }) {
  const company = await getCompanyById(params.id);
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${company.name}`} description="Update company details" />
      <CompanyForm
        initialData={{
          id: company.id,
          name: company.name,
          companyType: company.companyType,
          country: company.country,
          city: company.city,
          website: company.website || "",
          description: company.description || "",
          source: company.source || "",
          status: company.status
        }}
      />
    </div>
  );
}
