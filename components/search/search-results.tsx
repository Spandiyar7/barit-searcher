import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { type Locale } from "@/lib/i18n/config";

export type SearchPayload = {
  companies: Array<{ id: string; name: string; country: string; city: string }>;
  contacts: Array<{ id: string; fullName: string; position: string | null; company: { id: string; name: string } }>;
  products: Array<{ id: string; name: string; category: string }>;
  leads: Array<{ id: string; title: string; product: { id: string; name: string }; company: { id: string; name: string } | null }>;
  deals: Array<{
    id: string;
    product: { id: string; name: string };
    buyerCompany: { id: string; name: string } | null;
    sellerCompany: { id: string; name: string } | null;
  }>;
};

function Section({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <div className="mt-3 space-y-2">{children}</div>
    </Card>
  );
}

export function SearchResults({
  results,
  locale = "en"
}: {
  results: SearchPayload;
  locale?: Locale;
}) {
  const t = getTranslator(locale);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`${t("nav.companies")} (${results.companies.length})`}>
        {results.companies.length === 0 ? (
          <p className="text-sm text-slate-500">{t("search.noMatches")}</p>
        ) : (
          results.companies.map((item) => (
            <Link key={item.id} href={`/companies/${item.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">{item.name}</p>
              <p className="text-xs text-slate-500">{item.country} / {item.city}</p>
            </Link>
          ))
        )}
      </Section>

      <Section title={`${t("nav.contacts")} (${results.contacts.length})`}>
        {results.contacts.length === 0 ? (
          <p className="text-sm text-slate-500">{t("search.noMatches")}</p>
        ) : (
          results.contacts.map((item) => (
            <Link key={item.id} href={`/contacts/${item.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">{item.fullName}</p>
              <p className="text-xs text-slate-500">
                {item.position || t("search.noPosition")} {t("search.at")} {item.company.name}
              </p>
            </Link>
          ))
        )}
      </Section>

      <Section title={`${t("nav.products")} (${results.products.length})`}>
        {results.products.length === 0 ? (
          <p className="text-sm text-slate-500">{t("search.noMatches")}</p>
        ) : (
          results.products.map((item) => (
            <Link key={item.id} href={`/products/${item.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">{item.name}</p>
              <p className="text-xs text-slate-500">{item.category}</p>
            </Link>
          ))
        )}
      </Section>

      <Section title={`${t("nav.leads")} (${results.leads.length})`}>
        {results.leads.length === 0 ? (
          <p className="text-sm text-slate-500">{t("search.noMatches")}</p>
        ) : (
          results.leads.map((item) => (
            <Link key={item.id} href={`/leads/${item.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              <p className="text-xs text-slate-500">
                {item.product.name}
                {item.company ? ` / ${item.company.name}` : ""}
              </p>
            </Link>
          ))
        )}
      </Section>

      <Section title={`${t("nav.deals")} (${results.deals.length})`}>
        {results.deals.length === 0 ? (
          <p className="text-sm text-slate-500">{t("search.noMatches")}</p>
        ) : (
          results.deals.map((item) => (
            <Link key={item.id} href={`/deals/${item.id}`} className="block rounded-lg px-3 py-2 hover:bg-slate-50">
              <p className="text-sm font-medium text-slate-800">{item.product.name}</p>
              <p className="text-xs text-slate-500">
                {item.sellerCompany?.name || t("search.unknownSeller")} {t("search.to")}{" "}
                {item.buyerCompany?.name || t("search.unknownBuyer")}
              </p>
            </Link>
          ))
        )}
      </Section>
    </div>
  );
}
