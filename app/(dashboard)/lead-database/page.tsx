import { PageHeader } from "@/components/ui/page-header";
import { LeadDatabaseClient } from "@/components/lead-database/lead-database-client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function LeadDatabasePage() {
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("leadDatabase.title")} description={t("leadDatabase.description")} />
      <LeadDatabaseClient locale={locale} />
    </div>
  );
}
