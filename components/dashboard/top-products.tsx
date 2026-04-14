import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { type Locale } from "@/lib/i18n/config";

export function TopProducts({
  items,
  locale = "en"
}: {
  items: Array<{ id: string; name: string; leadsCount: number }>;
  locale?: Locale;
}) {
  const t = getTranslator(locale);

  return (
    <Card>
      <CardTitle>{t("dashboard.topProducts")}</CardTitle>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">{t("dashboard.noLeadData")}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/products/${item.id}`}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{item.name}</span>
              <span className="text-slate-500">
                {item.leadsCount} {t("dashboard.leadsCount")}
              </span>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
