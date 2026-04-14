import { PageHeader } from "@/components/ui/page-header";
import { TradeIntelligenceClient } from "@/components/trade-intelligence/trade-intelligence-client";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function TradeIntelligencePage() {
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("tradeIntelligence.title")} description={t("tradeIntelligence.description")} />
      <TradeIntelligenceClient locale={locale} />
    </div>
  );
}

