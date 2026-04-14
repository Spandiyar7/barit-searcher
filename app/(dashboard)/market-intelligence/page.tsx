import { PageHeader } from "@/components/ui/page-header";
import { MarketIntelligenceClient } from "@/components/market-intelligence/market-intelligence-client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function MarketIntelligencePage() {
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("marketIntelligence.title")} description={t("marketIntelligence.description")} />
      <MarketIntelligenceClient locale={locale} />
    </div>
  );
}
