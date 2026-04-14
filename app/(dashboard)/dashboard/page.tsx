import Link from "next/link";
import { getDashboardMetrics } from "@/lib/services/dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { LeadStatusChart } from "@/components/dashboard/lead-status-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { Card, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function DashboardPage() {
  const locale = getLocale();
  const t = getTranslator(locale);
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />

      <div className="dashboard-grid">
        <StatCard label={t("dashboard.companies")} value={metrics.totals.totalCompanies} />
        <StatCard label={t("dashboard.contacts")} value={metrics.totals.totalContacts} />
        <StatCard label={t("dashboard.products")} value={metrics.totals.totalProducts} />
        <StatCard label={t("dashboard.leads")} value={metrics.totals.totalLeads} />
        <StatCard
          label={t("dashboard.activeDeals")}
          value={metrics.totals.activeDeals}
          helper={t("dashboard.activeDealsHelper")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <LeadStatusChart counts={metrics.leadStatusCounts} locale={locale} />
        </div>
        <TopProducts items={metrics.topProducts} locale={locale} />
      </div>

      <Card>
        <CardTitle>{t("dashboard.recentActivities")}</CardTitle>
        <div className="mt-4 space-y-3">
          {metrics.recentActivities.length === 0 ? (
            <p className="text-sm text-slate-500">{t("dashboard.noActivity")}</p>
          ) : (
            metrics.recentActivities.map((activity) => (
              <div key={activity.id} className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge>{activity.type}</Badge>
                  <span className="text-xs text-slate-500">{fmtDate(activity.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-700">{activity.note}</p>
                <div className="mt-1 text-xs text-slate-500">
                  {activity.company ? (
                    <Link className="hover:text-primary" href={`/companies/${activity.company.id}`}>
                      {activity.company.name}
                    </Link>
                  ) : null}
                  {activity.contact ? (
                    <span>
                      {" "}
                      / {activity.contact.fullName}
                    </span>
                  ) : null}
                  {activity.lead ? (
                    <span>
                      {" "}
                      / {t("dashboard.leadLabel")}:{" "}
                      <Link className="hover:text-primary" href={`/leads/${activity.lead.id}`}>
                        {activity.lead.title}
                      </Link>
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
