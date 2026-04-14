import Link from "next/link";
import { DealStage } from "@prisma/client";
import { listDeals } from "@/lib/services/deals";
import { getProductOptions } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DealStageBadge } from "@/components/ui/entity-badges";
import { fmtMoney, fmtNumber } from "@/lib/utils/format";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function DealsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    productId: typeof searchParams.productId === "string" ? searchParams.productId : "",
    stage: (typeof searchParams.stage === "string" ? searchParams.stage : "") as DealStage | "",
    originCountry: typeof searchParams.originCountry === "string" ? searchParams.originCountry : "",
    destinationCountry: typeof searchParams.destinationCountry === "string" ? searchParams.destinationCountry : ""
  };

  const [deals, products] = await Promise.all([listDeals(filters), getProductOptions()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("deals.title")}
        description={t("deals.description")}
        actionHref="/deals/new"
        actionLabel={t("deals.add")}
      />

      <Card>
        <form className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Input name="q" defaultValue={filters.q} placeholder={t("deals.searchPlaceholder")} />
          <Select name="productId" defaultValue={filters.productId}>
            <option value="">{t("deals.allProducts")}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>
          <Select name="stage" defaultValue={filters.stage}>
            <option value="">{t("deals.allStages")}</option>
            {Object.values(DealStage).map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </Select>
          <Input name="originCountry" defaultValue={filters.originCountry} placeholder={t("deals.originCountry")} />
          <Input
            name="destinationCountry"
            defaultValue={filters.destinationCountry}
            placeholder={t("deals.destinationCountry")}
          />
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" type="submit">
            {t("common.filter")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {deals.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("deals.emptyTitle")}
              description={t("deals.emptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("common.product")}</TH>
                  <TH>{t("deals.seller")}</TH>
                  <TH>{t("deals.buyer")}</TH>
                  <TH>{t("deals.volumePrice")}</TH>
                  <TH>{t("common.route")}</TH>
                  <TH>{t("deals.stage")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {deals.map((deal) => (
                  <TR key={deal.id}>
                    <TD>{deal.product.name}</TD>
                    <TD>{deal.sellerCompany?.name || "-"}</TD>
                    <TD>{deal.buyerCompany?.name || "-"}</TD>
                    <TD>
                      {fmtNumber(deal.volume?.toString())} {deal.unit || ""} / {fmtMoney(deal.price?.toString(), deal.currency || "USD")}
                    </TD>
                    <TD>
                      {(deal.originCountry || "-") + " -> " + (deal.destinationCountry || "-")}
                    </TD>
                    <TD>
                      <DealStageBadge stage={deal.stage} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/deals/${deal.id}`} className="text-sm text-primary hover:underline">
                          {t("common.view")}
                        </Link>
                        <Link href={`/deals/${deal.id}/edit`} className="text-sm text-slate-600 hover:underline">
                          {t("common.edit")}
                        </Link>
                      </div>
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
