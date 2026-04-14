import { PageHeader } from "@/components/ui/page-header";
import { LeadDiscoveryClient } from "@/components/lead-discovery/lead-discovery-client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function LeadDiscoveryPage() {
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("leadDiscovery.title")} description={t("leadDiscovery.description")} />
      <LeadDiscoveryClient locale={locale} />
    </div>
  );
}

