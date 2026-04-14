import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardTitle } from "@/components/ui/card";
import { AILeadAnalyzer } from "@/components/leads/ai-lead-analyzer";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

export default async function IntelligencePage() {
  const locale = getLocale();
  const t = getTranslator(locale);
  const [topOrigins, topDestinations, topLeadProducts] = await Promise.all([
    prisma.lead.groupBy({
      by: ["originCountry"],
      _count: { _all: true },
      where: { originCountry: { not: null } },
      orderBy: { _count: { originCountry: "desc" } },
      take: 5
    }),
    prisma.lead.groupBy({
      by: ["destinationCountry"],
      _count: { _all: true },
      where: { destinationCountry: { not: null } },
      orderBy: { _count: { destinationCountry: "desc" } },
      take: 5
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { leads: true } }
      },
      orderBy: { leads: { _count: "desc" } },
      take: 5
    })
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("intelligence.title")}
        description={t("intelligence.description")}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>{t("intelligence.topOrigins")}</CardTitle>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {topOrigins.length === 0 ? (
              <p className="text-slate-500">{t("common.noData")}</p>
            ) : (
              topOrigins.map((row) => (
                <p key={row.originCountry}>{row.originCountry}: {row._count._all}</p>
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>{t("intelligence.topDestinations")}</CardTitle>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {topDestinations.length === 0 ? (
              <p className="text-slate-500">{t("common.noData")}</p>
            ) : (
              topDestinations.map((row) => (
                <p key={row.destinationCountry}>{row.destinationCountry}: {row._count._all}</p>
              ))
            )}
          </div>
        </Card>
        <Card>
          <CardTitle>{t("intelligence.topLeadProducts")}</CardTitle>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {topLeadProducts.length === 0 ? (
              <p className="text-slate-500">{t("common.noData")}</p>
            ) : (
              topLeadProducts.map((row) => (
                <p key={row.id}>{row.name}: {row._count.leads}</p>
              ))
            )}
          </div>
        </Card>
      </div>

      <AILeadAnalyzer locale={locale} />
    </div>
  );
}
