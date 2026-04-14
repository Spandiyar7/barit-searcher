import type { LeadStatus } from "@prisma/client";
import { Card, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { type Locale } from "@/lib/i18n/config";

const colorMap: Record<LeadStatus, string> = {
  NEW: "bg-sky-500",
  VERIFIED: "bg-indigo-500",
  CONTACTED: "bg-violet-500",
  NEGOTIATING: "bg-amber-500",
  CLOSED: "bg-emerald-500",
  DEAD: "bg-rose-500"
};

export function LeadStatusChart({
  counts,
  locale = "en"
}: {
  counts: Record<LeadStatus, number>;
  locale?: Locale;
}) {
  const t = getTranslator(locale);
  const max = Math.max(1, ...Object.values(counts));

  return (
    <Card>
      <CardTitle>{t("dashboard.leadStatusBreakdown")}</CardTitle>
      <div className="mt-4 space-y-3">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{status}</span>
              <span className="text-slate-500">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${colorMap[status as LeadStatus]}`}
                style={{ width: `${Math.max((count / max) * 100, count > 0 ? 10 : 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
