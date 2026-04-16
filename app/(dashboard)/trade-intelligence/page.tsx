import { PageHeader } from "@/components/ui/page-header";
import { TradeIntelligenceClient } from "@/components/trade-intelligence/trade-intelligence-client";
import { requireAdminUiAccess } from "@/lib/auth/ui-role";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function TradeIntelligencePage() {
  requireAdminUiAccess();
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("tradeIntelligence.title")} description={t("tradeIntelligence.description")} />
      <TradeIntelligenceClient locale={locale} />
    </div>
  );
}
