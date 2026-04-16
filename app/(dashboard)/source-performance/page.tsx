import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAdminUiAccess } from "@/lib/auth/ui-role";
import { fmtDate } from "@/lib/utils/format";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { getSourcePerformanceDashboardData } from "@/lib/services/source-performance";

const scoreClass = (value: number) => {
  if (value >= 60) return "text-emerald-700";
  if (value >= 35) return "text-amber-700";
  return "text-rose-700";
};

const BarList = <T extends { sourceName: string }>({
  title,
  items,
  getValue,
  formatter = (value: number) => value.toFixed(2)
}: {
  title: string;
  items: T[];
  getValue: (item: T) => number;
  formatter?: (value: number) => string;
}) => {
  if (items.length === 0) {
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
        <p className="mt-3 text-sm text-slate-500">-</p>
      </Card>
    );
  }

  const maxValue = Math.max(...items.map((item) => getValue(item)), 1);

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <div className="mt-3 space-y-2">
        {items.map((item) => {
          const value = getValue(item);
          const width = Math.max(4, Math.round((value / maxValue) * 100));
          return (
            <div key={`${title}-${item.sourceName}`} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate pr-2">{item.sourceName}</span>
                <span className="font-semibold text-slate-800">{formatter(value)}</span>
              </div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-primary" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default async function SourcePerformancePage() {
  requireAdminUiAccess();
  const locale = getLocale();
  const t = getTranslator(locale);
  const data = await getSourcePerformanceDashboardData();

  const totalAutomatedRuns = data.rows.reduce((acc, row) => acc + row.automatedRuns, 0);
  const totalFetchSuccessRuns = data.rows.reduce((acc, row) => acc + row.fetchSuccessRuns, 0);
  const totalParseSuccessRuns = data.rows.reduce((acc, row) => acc + row.parseSuccessRuns, 0);
  const totalImportedLeadRuns = data.rows.reduce((acc, row) => acc + row.importedLeadRuns, 0);

  const globalFetchRate = totalAutomatedRuns > 0 ? (totalFetchSuccessRuns / totalAutomatedRuns) * 100 : 0;
  const globalParseRate = totalAutomatedRuns > 0 ? (totalParseSuccessRuns / totalAutomatedRuns) * 100 : 0;
  const globalImportedRate = totalAutomatedRuns > 0 ? (totalImportedLeadRuns / totalAutomatedRuns) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("sourcePerformance.title")} description={t("sourcePerformance.description")} />

      <Card>
        <p className="text-xs text-slate-500">{t("sourcePerformance.rateDefinition")}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardTitle>{t("sourcePerformance.bestSource")}</CardTitle>
          <p className="mt-3 text-sm text-slate-700">{data.bestSource?.sourceName || "-"}</p>
          <p className={`text-xs font-semibold ${scoreClass(data.bestSource?.successRate || 0)}`}>
            {data.bestSource ? `${t("sourcePerformance.successRate")}: ${data.bestSource.successRate.toFixed(2)}%` : "-"}
          </p>
        </Card>
        <Card>
          <CardTitle>{t("sourcePerformance.worstSource")}</CardTitle>
          <p className="mt-3 text-sm text-slate-700">{data.worstSource?.sourceName || "-"}</p>
          <p className="text-xs font-semibold text-rose-700">
            {data.worstSource ? `${t("sourcePerformance.blockedRate")}: ${data.worstSource.blockedRate.toFixed(2)}%` : "-"}
          </p>
        </Card>
        <Card>
          <CardTitle>{t("sourcePerformance.importedLeads")}</CardTitle>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {data.rows.reduce((acc, row) => acc + row.totalImported, 0)}
          </p>
        </Card>
        <Card>
          <CardTitle>{t("sourcePerformance.rawLeads")}</CardTitle>
          <p className="mt-3 text-2xl font-bold text-slate-900">
            {data.rows.reduce((acc, row) => acc + row.totalRaw, 0)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardTitle>{t("sourcePerformance.fetchSuccessRate")}</CardTitle>
          <p className={`mt-3 text-2xl font-bold ${scoreClass(globalFetchRate)}`}>{globalFetchRate.toFixed(2)}%</p>
        </Card>
        <Card>
          <CardTitle>{t("sourcePerformance.parseSuccessRate")}</CardTitle>
          <p className={`mt-3 text-2xl font-bold ${scoreClass(globalParseRate)}`}>{globalParseRate.toFixed(2)}%</p>
        </Card>
        <Card>
          <CardTitle>{t("sourcePerformance.importedLeadRate")}</CardTitle>
          <p className={`mt-3 text-2xl font-bold ${scoreClass(globalImportedRate)}`}>{globalImportedRate.toFixed(2)}%</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BarList
          title={t("sourcePerformance.topPerforming")}
          items={data.topPerforming}
          getValue={(item) => item.successRate}
          formatter={(value) => `${value.toFixed(2)}%`}
        />
        <BarList
          title={t("sourcePerformance.mostBlocked")}
          items={data.mostBlocked}
          getValue={(item) => item.blockedRate}
          formatter={(value) => `${value.toFixed(2)}%`}
        />
        <BarList
          title={t("sourcePerformance.importedLeadsBySource")}
          items={data.importedLeadsBySource}
          getValue={(item) => item.totalImported}
        />
        <BarList
          title={t("sourcePerformance.rawLeadsBySource")}
          items={data.rawLeadsBySource}
          getValue={(item) => item.totalRaw}
        />
      </div>

      <Card className="overflow-hidden p-0">
        {data.rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("sourcePerformance.noData")} description={t("sourcePerformance.noData")} />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("sourcePerformance.source")}</TH>
                  <TH>{t("sourcePerformance.totalRuns")}</TH>
                  <TH>{t("sourcePerformance.automatedRuns")}</TH>
                  <TH>{t("sourcePerformance.successRate")}</TH>
                  <TH>{t("sourcePerformance.fetchSuccessRate")}</TH>
                  <TH>{t("sourcePerformance.parseSuccessRate")}</TH>
                  <TH>{t("sourcePerformance.importedLeadRate")}</TH>
                  <TH>{t("sourcePerformance.blockedRate")}</TH>
                  <TH>{t("sourcePerformance.avgExtracted")}</TH>
                  <TH>{t("sourcePerformance.avgImported")}</TH>
                  <TH>{t("sourcePerformance.avgRaw")}</TH>
                  <TH>{t("sourcePerformance.lastSuccess")}</TH>
                  <TH>{t("sourcePerformance.lastBlocked")}</TH>
                  <TH>{t("sourcePerformance.bestIntents")}</TH>
                  <TH>{t("sourcePerformance.bestProductCategories")}</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.sourceId}>
                    <TD>{row.sourceName}</TD>
                    <TD>{row.totalRuns}</TD>
                    <TD>{row.automatedRuns}</TD>
                    <TD className={scoreClass(row.successRate)}>{row.successRate.toFixed(2)}%</TD>
                    <TD className={scoreClass(row.fetchSuccessRate)}>{row.fetchSuccessRate.toFixed(2)}%</TD>
                    <TD className={scoreClass(row.parseSuccessRate)}>{row.parseSuccessRate.toFixed(2)}%</TD>
                    <TD className={scoreClass(row.importedLeadRate)}>{row.importedLeadRate.toFixed(2)}%</TD>
                    <TD className={scoreClass(100 - row.blockedRate)}>{row.blockedRate.toFixed(2)}%</TD>
                    <TD>{row.averageExtractedResults.toFixed(2)}</TD>
                    <TD>{row.averageImportedLeads.toFixed(2)}</TD>
                    <TD>{row.averageRawLeads.toFixed(2)}</TD>
                    <TD>{fmtDate(row.lastSuccessAt)}</TD>
                    <TD>{fmtDate(row.lastBlockedAt)}</TD>
                    <TD>{row.bestIntentTypes.length ? row.bestIntentTypes.join(", ") : "-"}</TD>
                    <TD>
                      {row.bestProductCategories.length
                        ? row.bestProductCategories.join(", ")
                        : t("sourcePerformance.noCategoryData")}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
