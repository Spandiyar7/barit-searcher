import { getCompanyOptions } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { ContactForm } from "@/components/contacts/contact-form";

export default async function NewContactPage() {
  const companies = await getCompanyOptions();

  return (
    <div className="space-y-6">
      <PageHeader title="Add Contact" description="Create a new person profile linked to a company" />
      <ContactForm companies={companies} />
    </div>
  );
}
