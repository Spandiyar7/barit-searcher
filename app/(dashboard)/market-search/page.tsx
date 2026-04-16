import { PageHeader } from "@/components/ui/page-header";
import { MarketSearchClient } from "@/components/market-search/market-search-client";
import { requireAdminUiAccess } from "@/lib/auth/ui-role";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default function MarketSearchPage() {
  requireAdminUiAccess();
  const locale = getLocale();
  const t = getTranslator(locale);

  return (
    <div className="space-y-6">
      <PageHeader title={t("marketSearch.title")} description={t("marketSearch.description")} />
      <MarketSearchClient locale={locale} />
    </div>
  );
}
