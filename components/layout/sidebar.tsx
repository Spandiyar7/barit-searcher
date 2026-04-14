"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Contact2,
  LayoutDashboard,
  Package,
  Handshake,
  RadioTower,
  Search,
  Lightbulb,
  Globe2,
  Radar,
  Database,
  BarChart3,
  Sparkles,
  Compass,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

const primaryNavItems = [
  { href: "/lead-database", key: "nav.leadDatabase", icon: Users },
  { href: "/lead-discovery", key: "nav.leadDiscovery", icon: Sparkles },
  { href: "/trade-intelligence", key: "nav.tradeIntelligence", icon: Compass },
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/companies", key: "nav.companies", icon: Building2 },
  { href: "/contacts", key: "nav.contacts", icon: Contact2 },
  { href: "/leads", key: "nav.leads", icon: RadioTower },
  { href: "/deals", key: "nav.deals", icon: Handshake }
];

const internalNavItems = [
  { href: "/products", key: "nav.products", icon: Package },
  { href: "/search", key: "nav.searchLegacy", icon: Search },
  { href: "/market-search", key: "nav.marketSearchLegacy", icon: Globe2 },
  { href: "/market-intelligence", key: "nav.marketIntelligence", icon: Radar },
  { href: "/raw-market-leads", key: "nav.rawMarketLeads", icon: Database },
  { href: "/source-performance", key: "nav.sourcePerformance", icon: BarChart3 },
  { href: "/intelligence", key: "nav.intelligence", icon: Lightbulb }
];

export function Sidebar({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-white lg:block">
      <div className="flex h-16 items-center border-b border-border px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t("layout.brandTop")}</p>
          <h2 className="text-lg font-bold text-slate-900">{t("layout.brandBottom")}</h2>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {primaryNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon size={16} />
              {t(item.key)}
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {t("nav.internalTools")}
          </p>
          <div className="space-y-1">
            {internalNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <item.icon size={16} />
                  {t(item.key)}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
