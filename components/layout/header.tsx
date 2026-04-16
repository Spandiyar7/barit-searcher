"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

const titleKeyMap: Record<string, string> = {
  dashboard: "nav.dashboard",
  "lead-database": "nav.leadDatabase",
  "lead-discovery": "nav.leadDiscovery",
  "trade-intelligence": "nav.tradeIntelligence",
  companies: "nav.companies",
  contacts: "nav.contacts",
  products: "nav.products",
  leads: "nav.leads",
  deals: "nav.deals",
  search: "nav.searchLegacy",
  "market-search": "nav.marketSearchLegacy",
  "market-intelligence": "nav.marketIntelligence",
  "raw-market-leads": "nav.rawMarketLeads",
  "source-performance": "nav.sourcePerformance",
  intelligence: "nav.intelligence"
};

export function TopHeader({ locale, isAdmin }: { locale: Locale; isAdmin: boolean }) {
  const t = getTranslator(locale);
  const pathname = usePathname();
  const firstSegment = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const titleKey = titleKeyMap[firstSegment];
  const title = titleKey ? t(titleKey) : t("header.crm");
  const dateLabel = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date());

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-4 backdrop-blur md:px-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-400">{dateLabel}</p>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin ? (
          <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-slate-500">
            {t("nav.internalTools")}
          </span>
        ) : null}
        <LanguageSwitcher locale={locale} />
      </div>
    </header>
  );
}
