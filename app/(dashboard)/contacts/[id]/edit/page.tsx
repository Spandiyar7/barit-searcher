import { notFound } from "next/navigation";
import { getContactById } from "@/lib/services/contacts";
import { getCompanyOptions } from "@/lib/services/companies";
import { PageHeader } from "@/components/ui/page-header";
import { ContactForm } from "@/components/contacts/contact-form";

export default async function EditContactPage({ params }: { params: { id: string } }) {
  const [contact, companies] = await Promise.all([getContactById(params.id), getCompanyOptions()]);
  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${contact.fullName}`} description="Update contact details" />
      <ContactForm
        companies={companies}
        initialData={{
          id: contact.id,
          companyId: contact.companyId,
          fullName: contact.fullName,
          position: contact.position || "",
          email: contact.email || "",
          phone: contact.phone || "",
          whatsapp: contact.whatsapp || "",
          telegram: contact.telegram || "",
          notes: contact.notes || ""
        }}
      />
    </div>
  );
}
