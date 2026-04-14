import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactById } from "@/lib/services/contacts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/ui/delete-button";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ActivityForm } from "@/components/activities/activity-form";
import { fmtDate } from "@/lib/utils/format";

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContactById(params.id);
  if (!contact) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={contact.fullName} description={contact.position || "Contact profile"} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3 xl:col-span-2">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Company:</span>{" "}
            <Link href={`/companies/${contact.company.id}`} className="text-primary hover:underline">
              {contact.company.name}
            </Link>
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Email:</span> {contact.email || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Phone:</span> {contact.phone || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">WhatsApp:</span> {contact.whatsapp || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Telegram:</span> {contact.telegram || "-"}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Notes:</span> {contact.notes || "-"}
          </p>
          <p className="text-xs text-slate-500">Created: {fmtDate(contact.createdAt)}</p>
          <div className="flex gap-2">
            <Link href={`/contacts/${contact.id}/edit`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
              Edit
            </Link>
            <DeleteButton endpoint={`/api/contacts/${contact.id}`} redirectTo="/contacts" />
          </div>
        </Card>

        <Card>
          <CardTitle>Quick View</CardTitle>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Company: {contact.company.name}</p>
            <p>Position: {contact.position || "-"}</p>
            <p>Activity Records: {contact.activities.length}</p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Activity Timeline</CardTitle>
          <div className="mt-3">
            <ActivityTimeline activities={contact.activities} />
          </div>
        </Card>
        <Card>
          <CardTitle>Add Activity</CardTitle>
          <div className="mt-3">
            <ActivityForm contactId={contact.id} companyId={contact.companyId} />
          </div>
        </Card>
      </div>
    </div>
  );
}
