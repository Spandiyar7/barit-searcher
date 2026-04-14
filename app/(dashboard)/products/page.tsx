import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { listProducts } from "@/lib/services/products";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = getLocale();
  const t = getTranslator(locale);

  const filters = {
    q: typeof searchParams.q === "string" ? searchParams.q : "",
    category: typeof searchParams.category === "string" ? searchParams.category : ""
  };

  const [products, categoryRows] = await Promise.all([
    listProducts(filters),
    prisma.product.findMany({
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" }
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("products.title")}
        description={t("products.description")}
        actionHref="/products/new"
        actionLabel={t("products.add")}
      />

      <Card>
        <form className="grid gap-3 md:grid-cols-3">
          <Input name="q" defaultValue={filters.q} placeholder={t("products.searchPlaceholder")} />
          <Select name="category" defaultValue={filters.category}>
            <option value="">{t("products.allCategories")}</option>
            {categoryRows.map((row) => (
              <option key={row.category} value={row.category}>
                {row.category}
              </option>
            ))}
          </Select>
          <button className="rounded-lg bg-primary px-4 text-sm font-semibold text-white" type="submit">
            {t("common.filter")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        {products.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={t("products.emptyTitle")}
              description={t("products.emptyDescription")}
            />
          </div>
        ) : (
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("common.product")}</TH>
                  <TH>{t("products.category")}</TH>
                  <TH>{t("products.hsCode")}</TH>
                  <TH>{t("products.synonyms")}</TH>
                  <TH>{t("dashboard.leads")}</TH>
                  <TH>{t("products.deals")}</TH>
                  <TH className="text-right">{t("common.actions")}</TH>
                </TR>
              </THead>
              <TBody>
                {products.map((product) => (
                  <TR key={product.id}>
                    <TD className="font-medium text-slate-800">{product.name}</TD>
                    <TD>{product.category}</TD>
                    <TD>{product.hsCode || "-"}</TD>
                    <TD className="max-w-[280px] truncate">{product.synonyms.join(", ") || "-"}</TD>
                    <TD>{product._count.leads}</TD>
                    <TD>{product._count.deals}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link href={`/products/${product.id}`} className="text-sm text-primary hover:underline">
                          {t("common.view")}
                        </Link>
                        <Link href={`/products/${product.id}/edit`} className="text-sm text-slate-600 hover:underline">
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
