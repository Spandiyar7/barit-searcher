import { globalSearch } from "@/lib/services/search";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchResults, type SearchPayload } from "@/components/search/search-results";
import { requireAdminUiAccess } from "@/lib/auth/ui-role";
import { getLocale } from "@/lib/i18n/get-locale";
import { getTranslator } from "@/lib/i18n/dictionaries";

const EXAMPLES = [
  "barite",
  "barite buyers UAE",
  "sulfur Kazakhstan supplier",
  "urea CIF China",
  "lentils Turkey",
  "polypropylene trader CIS"
];

export default async function SearchPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  requireAdminUiAccess();
  const locale = getLocale();
  const t = getTranslator(locale);
  const query = typeof searchParams.q === "string" ? searchParams.q : "";
  const results: SearchPayload = await globalSearch(query);

  return (
    <div className="space-y-6">
      <PageHeader title={t("search.title")} description={t("search.description")} />

      <Card>
        <form className="space-y-3">
          <Input name="q" defaultValue={query} placeholder={t("search.placeholder")} />
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white" type="submit">
            {t("common.search")}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <a
              key={example}
              href={`/search?q=${encodeURIComponent(example)}`}
              className="rounded-full border border-border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {example}
            </a>
          ))}
        </div>
      </Card>

      {query ? <SearchResults results={results} locale={locale} /> : null}
    </div>
  );
}
