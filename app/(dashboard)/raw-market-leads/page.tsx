import Link from "next/link";
import { RawMarketLeadStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDate } from "@/lib/utils/format";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { listRawMarketLeads } from "@/lib/services/raw-market-leads";
import { RawMarketLeadActions } from "@/components/raw-market-leads/raw-market-lead-actions";

const statusClassMap: Record<RawMarketLeadStatus, "warning" | "success" | "default"> = {
  PENDING_REVIEW: "warning",
  IMPORTED: "success",
  REJECTED: "default"
};

const kindVariant = (kind: string) => {
  if (kind === "live") return "success" as const;
  if (kind === "fallback") return "warning" as const;
  if (kind === "test" || kind === "mock") return "danger" as const;
  return "default" as const;
};

const modeVariant = (mode: string) => {
  if (mode === "fetch" || mode === "browser") return "info" as const;
  if (mode === "manual") return "warning" as const;
  if (mode === "generated") return "danger" as const;
  return "default" as const;
};

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
};

const buildQuery = (
  base: {
    product: string;
    sourceName: string;
    country: string;
    confidenceScore: number | null;
    createdAt: string;
    pageSize: number;
  },
  page: number
) => {
  const query = new URLSearchParams();
  if (base.product) query.set("product", base.product);
  if (base.sourceName) query.set("sourceName", base.sourceName);
  if (base.country) query.set("country", base.country);
  if (typeof base.confidenceScore === "number" && Number.isFinite(base.confidenceScore)) {
    query.set("confidenceScore", String(base.confidenceScore));
  }
  if (base.createdAt) query.set("createdAt", base.createdAt);
  if (base.pageSize !== 25) query.set("pageSize", String(base.pageSize));
  if (page > 1) query.set("page", String(page));
  return `?${query.toString()}`;
};

export default async function RawMarketLeadsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    product: typeof searchParams.product === "string" ? searchParams.product : "",
    sourceName: typeof searchParams.sourceName === "string" ? searchParams.sourceName : "",
    country: typeof searchParams.country === "string" ? searchParams.country : "",
    confidenceScore:
      typeof searchParams.confidenceScore === "string" && searchParams.confidenceScore !== ""
        ? Number(searchParams.confidenceScore)
        : null,
    createdAt: typeof searchParams.createdAt === "string" ? searchParams.createdAt : "",
    page: typeof searchParams.page === "string" ? Number(searchParams.page) : 1,
    pageSize: typeof searchParams.pageSize === "string" ? Number(searchParams.pageSize) : 25
  };

  const result = await listRawMarketLeads(filters);

  return (
    <div className="space-y-6">
      <PageHeader title={t("rawMarketLeads.title")} description={t("rawMarketLeads.description")} />

      <Card>
        <form className="grid gap-3 md:grid-cols-6">
          <Input name="product" defaultValue={filters.product} placeholder={t("rawMarketLeads.filterProduct")} />
          <Input name="sourceName" defaultValue={filters.sourceName} placeholder={t("rawMarketLeads.filterSourceName")} />
          <Input name="country" defaultValue={filters.country} placeholder={t("rawMarketLeads.filterCountry")} />
          <Input
            name="confidenceScore"
            type="number"
            step="0.01"
            min="0"
            max="1"
            defaultValue={filters.confidenceScore ?? ""}
            placeholder={t("rawMarketLeads.filterConfidenceScore")}
          />
          <Input name="createdAt" type="date" defaultValue={filters.createdAt} placeholder={t("rawMarketLeads.filterCreatedAt")} />
          <Input
            name="pageSize"
            type="number"
            min="10"
            max="100"
            step="5"
            defaultValue={result.pageSize}
            placeholder="25"
          />
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white md:col-span-6" type="submit">
            {t("common.applyFilters")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {result.items.length === 0 ? (
          <div className="p-5">
            <EmptyState title={t("rawMarketLeads.emptyTitle")} description={t("rawMarketLeads.emptyDescription")} />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table className="table-fixed">
              <THead>
                <TR>
                  <TH className="w-[160px]">{t("common.company")}</TH>
                  <TH className="w-[120px]">{t("common.product")}</TH>
                  <TH className="w-[110px]">{t("common.country")}</TH>
                  <TH className="w-[120px]">{t("rawMarketLeads.sourceName")}</TH>
                  <TH className="w-[260px]">{t("rawMarketLeads.sourceUrl")}</TH>
                  <TH className="w-[130px]">{t("rawMarketLeads.sourceKind")}</TH>
                  <TH className="w-[130px]">{t("rawMarketLeads.importMode")}</TH>
                  <TH className="w-[90px]">{t("rawMarketLeads.confidenceScore")}</TH>
                  <TH className="w-[190px]">{t("rawMarketLeads.searchJobId")}</TH>
                  <TH className="w-[190px]">{t("rawMarketLeads.sourceRunId")}</TH>
                  <TH className="w-[130px]">{t("rawMarketLeads.createdAt")}</TH>
                  <TH className="w-[120px]">{t("common.status")}</TH>
                  <TH className="w-[230px] text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {result.items.map((row) => {
                  const host = getHostname(row.sourceUrl);
                  const statusLabel =
                    row.status === "PENDING_REVIEW"
                      ? t("rawMarketLeads.statusPending")
                      : row.status === "IMPORTED"
                        ? t("rawMarketLeads.statusImported")
                        : t("rawMarketLeads.statusRejected");

                  return (
                    <TR key={row.id}>
                      <TD className="align-top">{row.company || "-"}</TD>
                      <TD className="align-top">{row.product || "-"}</TD>
                      <TD className="align-top">{row.country || "-"}</TD>
                      <TD className="align-top">
                        <div className="truncate" title={row.sourceName}>
                          {row.sourceName}
                        </div>
                      </TD>
                      <TD className="align-top">
                        <div className="max-w-[240px]">
                          <Link
                            href={row.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={row.sourceUrl}
                            className="block truncate text-sm text-primary hover:underline"
                          >
                            {row.sourceUrl}
                          </Link>
                          {host ? <p className="truncate text-xs text-slate-400">{host}</p> : null}
                        </div>
                      </TD>
                      <TD className="align-top">
                        <Badge variant={kindVariant(row.sourceKind)}>{t(`sourceKind.${row.sourceKind}`)}</Badge>
                      </TD>
                      <TD className="align-top">
                        <Badge variant={modeVariant(row.importMode)}>{t(`importMode.${row.importMode}`)}</Badge>
                      </TD>
                      <TD className="align-top">{row.confidenceScore === null ? "-" : row.confidenceScore.toFixed(2)}</TD>
                      <TD className="align-top">
                        <code className="block max-w-[180px] truncate text-xs text-slate-600" title={row.searchJobId || ""}>
                          {row.searchJobId || t("rawMarketLeads.noSearchJob")}
                        </code>
                      </TD>
                      <TD className="align-top">
                        <code className="block max-w-[180px] truncate text-xs text-slate-600" title={row.sourceRunId || ""}>
                          {row.sourceRunId || t("rawMarketLeads.noSourceRun")}
                        </code>
                      </TD>
                      <TD className="align-top">{fmtDate(row.createdAt)}</TD>
                      <TD className="align-top">
                        <Badge variant={statusClassMap[row.status]}>{statusLabel}</Badge>
                      </TD>
                      <TD className="text-right align-top">
                        <RawMarketLeadActions
                          id={row.id}
                          status={row.status}
                          labels={{
                            promote: t("rawMarketLeads.promote"),
                            reject: t("rawMarketLeads.reject"),
                            duplicate: t("rawMarketLeads.markDuplicate"),
                            promoting: t("rawMarketLeads.promoting"),
                            rejecting: t("rawMarketLeads.rejecting"),
                            markingDuplicate: t("rawMarketLeads.markingDuplicate")
                          }}
                        />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      {result.total > 0 ? (
        <Card className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              {t("rawMarketLeads.page")} {result.page} / {result.totalPages} • {result.total}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={buildQuery(filters, Math.max(1, result.page - 1))}
                className={`rounded-lg border px-3 py-1.5 ${result.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}
              >
                {t("rawMarketLeads.prevPage")}
              </Link>
              <Link
                href={buildQuery(filters, Math.min(result.totalPages, result.page + 1))}
                className={`rounded-lg border px-3 py-1.5 ${result.page >= result.totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}
              >
                {t("rawMarketLeads.nextPage")}
              </Link>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
