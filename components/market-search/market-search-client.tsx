"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { ImportMarketSearchResponse, MarketSearchMode, MarketSearchResult } from "@/lib/services/market-search/types";

type SearchResponsePayload = {
  data: {
    results: MarketSearchResult[];
    warnings: string[];
  };
};

type ImportStatus = {
  tone: "success" | "warning" | "error";
  text: string;
};

export function MarketSearchClient({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState<MarketSearchMode>("buyers");
  const [country, setCountry] = useState("");
  const [withAi, setWithAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<MarketSearchResult[]>([]);
  const [importState, setImportState] = useState<Record<string, ImportStatus>>({});

  const hasResults = results.length > 0;

  const orderedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        const aDone = importState[a.id] ? 1 : 0;
        const bDone = importState[b.id] ? 1 : 0;
        return aDone - bDone;
      }),
    [results, importState]
  );

  const onSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setSearched(true);
    setImportState({});

    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      setError(t("marketSearch.keywordRequired"));
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const query = new URLSearchParams({
        keyword: trimmedKeyword,
        mode,
        country: country.trim()
      });

      const response = await fetch(`/api/market-search?${query.toString()}`);
      const payload = (await response.json().catch(() => ({}))) as { error?: string } & SearchResponsePayload;
      if (!response.ok) {
        throw new Error(payload.error || t("marketSearch.fetchError"));
      }

      setResults(payload.data.results || []);
      if (payload.data.warnings?.length) {
        setWarning(payload.data.warnings[0]);
      }
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : t("marketSearch.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const onImport = async (result: MarketSearchResult) => {
    setSavingId(result.id);
    setError(null);

    try {
      const response = await fetch("/api/market-search/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: keyword.trim(),
          withAi,
          result
        })
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { error?: string }
        | { data: ImportMarketSearchResponse };

      if (!response.ok || !("data" in payload)) {
        throw new Error((payload as { error?: string }).error || t("marketSearch.importError"));
      }

      const data = payload.data;
      const status: ImportStatus =
        data.status === "duplicate"
          ? { tone: "warning", text: t("marketSearch.alreadyImported") }
          : { tone: "success", text: t("marketSearch.importSuccessful") };

      setImportState((prev) => ({ ...prev, [result.id]: status }));
    } catch (importError) {
      setImportState((prev) => ({
        ...prev,
        [result.id]: { tone: "error", text: importError instanceof Error ? importError.message : t("marketSearch.importError") }
      }));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <form className="grid gap-3 md:grid-cols-5" onSubmit={onSearch}>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t("marketSearch.keywordPlaceholder")}
            aria-label={t("marketSearch.keyword")}
          />
          <Select value={mode} onChange={(event) => setMode(event.target.value as MarketSearchMode)}>
            <option value="buyers">{t("marketSearch.buyers")}</option>
            <option value="suppliers">{t("marketSearch.suppliers")}</option>
          </Select>
          <Input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder={t("marketSearch.countryPlaceholder")}
            aria-label={t("marketSearch.country")}
          />
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={withAi}
              onChange={(event) => setWithAi(event.target.checked)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            {t("marketSearch.useAiOnImport")}
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? t("marketSearch.searching") : t("marketSearch.search")}
          </Button>
        </form>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        {warning ? <p className="mt-3 text-xs text-amber-700">{warning}</p> : null}
      </Card>

      {searched && !loading && !hasResults ? (
        <EmptyState title={t("marketSearch.noResultsFound")} description={t("marketSearch.noResultsDescription")} />
      ) : null}

      {hasResults ? (
        <div className="space-y-3">
          {orderedResults.map((result) => (
            <Card key={result.id} className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <CardTitle>{result.title}</CardTitle>
                  <p className="text-xs text-slate-500">
                    {t("marketSearch.source")}:{" "}
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={result.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      go4WorldBusiness <ExternalLink size={12} />
                    </a>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={savingId === result.id || importState[result.id]?.tone === "success"}
                  onClick={() => onImport(result)}
                >
                  {savingId === result.id ? t("marketSearch.savingLead") : t("marketSearch.saveAsLead")}
                </Button>
              </div>

              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.company")}:</span> {result.companyName || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("common.country")}:</span> {result.country || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.quantity")}:</span> {result.quantity || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.paymentTerms")}:</span>{" "}
                  {result.paymentTerms || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.shippingTerms")}:</span>{" "}
                  {result.shippingTerms || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.destination")}:</span>{" "}
                  {result.destination || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketSearch.postedDate")}:</span>{" "}
                  {result.postedDate || "-"}
                </p>
              </div>

              <p className="text-sm text-slate-600">{result.snippet}</p>

              {importState[result.id] ? (
                <p
                  className={
                    importState[result.id].tone === "success"
                      ? "text-sm text-emerald-700"
                      : importState[result.id].tone === "warning"
                        ? "text-sm text-amber-700"
                        : "text-sm text-rose-600"
                  }
                >
                  {importState[result.id].text}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
