import { PageHeader } from "@/components/ui/page-header";
import { CompanyForm } from "@/components/companies/company-form";

export default function NewCompanyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add Company" description="Create a new counterparty profile" />
      <CompanyForm />
    </div>
  );
}
