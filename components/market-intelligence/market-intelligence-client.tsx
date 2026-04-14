"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type {
  CreateSearchJobResponse,
  JobResultItem,
  MarketIntelligenceImportResponse,
  MarketIntelligenceJobSnapshot,
  MarketIntelligenceManualImportResponse,
  SavedSearchItem,
  SearchIntent,
  SourceDiagnostic
} from "@/lib/services/market-intelligence";

const EXAMPLES = [
  "barite buyers UAE",
  "sulfur supplier Kazakhstan",
  "urea CIF China importer",
  "polypropylene manufacturers Turkey",
  "lentils exporter Russia"
];

type ApiPayload<T> = { data: T; error?: string };
type ManualImportPayload = ApiPayload<MarketIntelligenceManualImportResponse>;
type ImportPayload = ApiPayload<MarketIntelligenceImportResponse>;

const jobStatusClass = (status: string) => {
  if (status === "COMPLETED") return "bg-emerald-100 text-emerald-700";
  if (status === "RUNNING") return "bg-blue-100 text-blue-700";
  if (status === "FAILED") return "bg-rose-100 text-rose-700";
  if (status === "CANCELED") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
};

const sourceStatusClass = (status: SourceDiagnostic["status"]) => {
  if (status === "ok") return "bg-emerald-100 text-emerald-700";
  if (status === "blocked") return "bg-rose-100 text-rose-700";
  if (status === "manual") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
};

const persistenceClass = (status: JobResultItem["persistence_status"]) => {
  if (status === "imported") return "bg-emerald-100 text-emerald-700";
  if (status === "staged") return "bg-amber-100 text-amber-700";
  if (status === "duplicate") return "bg-slate-100 text-slate-700";
  return "bg-blue-100 text-blue-700";
};

const localizeSourceReason = (reason: string, t: (key: string, fallback?: string) => string) => {
  if (!reason) return "-";

  const phraseMap: Array<{ pattern: RegExp; key: string }> = [
    { pattern: /Tier 1 priority/gi, key: "marketIntelligence.reason.tier1Priority" },
    { pattern: /Tier 2 signal support/gi, key: "marketIntelligence.reason.tier2Signal" },
    { pattern: /Tier 3 fallback/gi, key: "marketIntelligence.reason.tier3Fallback" },
    { pattern: /Default weight/gi, key: "marketIntelligence.reason.defaultWeight" },
    { pattern: /Reliability/gi, key: "marketIntelligence.reason.reliability" },
    { pattern: /Product-category fit/gi, key: "marketIntelligence.reason.categoryFit" },
    { pattern: /Weak category fit/gi, key: "marketIntelligence.reason.weakCategoryFit" },
    { pattern: /Query-to-source mapping boost/gi, key: "marketIntelligence.reason.querySourceBoost" },
    { pattern: /Specialization match/gi, key: "marketIntelligence.reason.specializationMatch" },
    { pattern: /Intent match/gi, key: "marketIntelligence.reason.intentMatch" },
    { pattern: /Intent mismatch/gi, key: "marketIntelligence.reason.intentMismatch" },
    { pattern: /Market-signal source/gi, key: "marketIntelligence.reason.marketSignalSource" },
    { pattern: /Importer intent boost/gi, key: "marketIntelligence.reason.importerIntentBoost" },
    { pattern: /Exporter intent analytics boost/gi, key: "marketIntelligence.reason.exporterIntentBoost" },
    { pattern: /Recurring buyer signal boost/gi, key: "marketIntelligence.reason.recurringSignalBoost" },
    { pattern: /Engine available/gi, key: "marketIntelligence.reason.engineAvailable" },
    { pattern: /No native engine/gi, key: "marketIntelligence.reason.noNativeEngine" },
    { pattern: /Country fit/gi, key: "marketIntelligence.reason.countryFit" },
    { pattern: /Browser execution/gi, key: "marketIntelligence.reason.browserExecution" },
    { pattern: /Auto execution/gi, key: "marketIntelligence.reason.autoExecution" },
    { pattern: /Result-type fit/gi, key: "marketIntelligence.reason.resultTypeFit" },
    { pattern: /Manual mode penalty/gi, key: "marketIntelligence.reason.manualPenalty" },
    { pattern: /High anti-bot risk/gi, key: "marketIntelligence.reason.highAntiBotRisk" },
    { pattern: /Fallback-only for specialized commodity queries/gi, key: "marketIntelligence.reason.fallbackOnlySpecialized" },
    { pattern: /Specialized Tier 1 match/gi, key: "marketIntelligence.reason.specializedTier1" }
  ];

  let localized = reason;
  for (const item of phraseMap) {
    localized = localized.replace(item.pattern, t(item.key));
  }
  return localized;
};

const diagnosticCodeClass = (code: SourceDiagnostic["diagnostic_code"]) => {
  if (code === "ok") return "bg-emerald-100 text-emerald-700";
  if (code === "fallback_blocked") return "bg-rose-100 text-rose-700";
  if (code === "source_native_failure") return "bg-amber-100 text-amber-700";
  if (code === "no_adapter") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-600";
};

export function MarketIntelligenceClient({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [intent, setIntent] = useState<"" | SearchIntent>("");
  const [customSources, setCustomSources] = useState("");

  const [loadingJob, setLoadingJob] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MarketIntelligenceJobSnapshot | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [forceImportingId, setForceImportingId] = useState<string | null>(null);
  const [forceImportState, setForceImportState] = useState<Record<string, string>>({});
  const [saveLinkMessage, setSaveLinkMessage] = useState<string | null>(null);

  const [savedSearches, setSavedSearches] = useState<SavedSearchItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState("");
  const [savedFrequency, setSavedFrequency] = useState("24");

  const [manualSourceName, setManualSourceName] = useState("Manual Source");
  const [manualSourceUrl, setManualSourceUrl] = useState("");
  const [manualPageText, setManualPageText] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<MarketIntelligenceManualImportResponse | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const [showFallbackOnly, setShowFallbackOnly] = useState(false);

  const results = useMemo(() => snapshot?.results || [], [snapshot]);
  const diagnostics = snapshot?.source_diagnostics || [];
  const hasResults = results.length > 0;

  const orderedResults = useMemo(
    () =>
      [...results].sort((a, b) => {
        const scoreA = (a.relevance_score || 0) + (a.confidence_score || 0);
        const scoreB = (b.relevance_score || 0) + (b.confidence_score || 0);
        return scoreB - scoreA;
      }),
    [results]
  );

  const loadSavedSearches = useCallback(async () => {
    try {
      setSavedLoading(true);
      setSavedError(null);
      const response = await fetch("/api/market-intelligence/saved-searches");
      const json = (await response.json().catch(() => ({}))) as ApiPayload<SavedSearchItem[]>;
      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.savedSearchLoadError"));
      }
      setSavedSearches(json.data);
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : t("marketIntelligence.savedSearchLoadError"));
    } finally {
      setSavedLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSavedSearches();
  }, [loadSavedSearches]);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        setPolling(true);
        const response = await fetch(`/api/market-intelligence/jobs/${activeJobId}`);
        const json = (await response.json().catch(() => ({}))) as ApiPayload<MarketIntelligenceJobSnapshot>;

        if (!response.ok || !json.data) {
          throw new Error(json.error || t("marketIntelligence.fetchError"));
        }

        if (cancelled) return;

        setSnapshot(json.data);
        setJobError(null);

        if (json.data.job.status === "PENDING" || json.data.job.status === "RUNNING") {
          timer = setTimeout(() => {
            void poll();
          }, 2500);
        }
      } catch (error) {
        if (!cancelled) {
          setJobError(error instanceof Error ? error.message : t("marketIntelligence.fetchError"));
          timer = setTimeout(() => {
            void poll();
          }, 4000);
        }
      } finally {
        if (!cancelled) {
          setPolling(false);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeJobId, t]);

  const runSearchJob = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJobError(null);
    setSaveLinkMessage(null);

    if (!query.trim()) {
      setJobError(t("marketIntelligence.keywordRequired"));
      return;
    }

    try {
      setLoadingJob(true);
      const response = await fetch("/api/market-intelligence/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim(),
          country: country.trim(),
          intent: intent || undefined,
          customSources: customSources.trim()
        })
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<CreateSearchJobResponse>;

      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.createJobError"));
      }

      setActiveJobId(json.data.job_id);
      setSnapshot(null);
      setShowFallbackOnly(false);
    } catch (error) {
      setJobError(error instanceof Error ? error.message : t("marketIntelligence.createJobError"));
    } finally {
      setLoadingJob(false);
    }
  };

  const forceImportResult = async (result: JobResultItem) => {
    setForceImportingId(result.id);
    try {
      const response = await fetch("/api/market-intelligence/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result,
          parsed_query: snapshot?.parsed_query,
          save_company: true,
          with_ai: false
        })
      });
      const json = (await response.json().catch(() => ({}))) as ImportPayload;

      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.importError"));
      }

      const text = json.data.status === "imported" ? t("marketIntelligence.importSuccessful") : t("marketIntelligence.alreadyImported");
      setForceImportState((prev) => ({ ...prev, [result.id]: text }));
      setActiveJobId((prev) => prev);
    } catch (error) {
      setForceImportState((prev) => ({
        ...prev,
        [result.id]: error instanceof Error ? error.message : t("marketIntelligence.importError")
      }));
    } finally {
      setForceImportingId(null);
    }
  };

  const saveSearchLink = async (url: string | null) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setSaveLinkMessage(t("marketIntelligence.searchLinkSaved"));
    } catch {
      setSaveLinkMessage(url);
    }
  };

  const startManualImportFromSource = (source: SourceDiagnostic) => {
    setManualSourceName(source.source_name);
    setManualSourceUrl(source.open_source_url || source.save_search_url || "");
    setManualError(null);
    setShowFallbackOnly(true);
  };

  const runManualImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError(null);
    setManualResult(null);

    if (!manualSourceUrl.trim() && !manualPageText.trim()) {
      setManualError(t("marketIntelligence.manualNeedInput"));
      return;
    }

    try {
      setManualLoading(true);
      const response = await fetch("/api/market-intelligence/manual-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_name: manualSourceName,
          source_url: manualSourceUrl,
          page_text: manualPageText,
          query: query.trim(),
          parsed_query: snapshot?.parsed_query,
          save_company: true,
          with_ai: true
        })
      });

      const json = (await response.json().catch(() => ({}))) as ManualImportPayload;

      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.manualImportError"));
      }

      setManualResult(json.data);
      setManualPageText("");
    } catch (error) {
      setManualError(error instanceof Error ? error.message : t("marketIntelligence.manualImportError"));
    } finally {
      setManualLoading(false);
    }
  };

  const createSavedSearchAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavedError(null);

    if (!query.trim()) {
      setSavedError(t("marketIntelligence.keywordRequired"));
      return;
    }

    try {
      setSavedLoading(true);
      const response = await fetch("/api/market-intelligence/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savedName.trim() || query.trim(),
          keyword: query.trim(),
          country: country.trim(),
          intent: intent || undefined,
          customSources: customSources.trim(),
          frequencyHours: Number(savedFrequency)
        })
      });

      const json = (await response.json().catch(() => ({}))) as ApiPayload<SavedSearchItem>;
      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.savedSearchCreateError"));
      }

      setSavedName("");
      await loadSavedSearches();
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : t("marketIntelligence.savedSearchCreateError"));
    } finally {
      setSavedLoading(false);
    }
  };

  const runSavedSearchAction = async (savedSearchId: string) => {
    try {
      const response = await fetch(`/api/market-intelligence/saved-searches/${savedSearchId}/run`, {
        method: "POST"
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<CreateSearchJobResponse>;
      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.savedSearchRunError"));
      }
      setActiveJobId(json.data.job_id);
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : t("marketIntelligence.savedSearchRunError"));
    }
  };

  const runDueScheduler = async () => {
    try {
      const response = await fetch("/api/market-intelligence/scheduler/run", {
        method: "POST"
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<{ scheduled: number }>;
      if (!response.ok || !json.data) {
        throw new Error(json.error || t("marketIntelligence.schedulerRunError"));
      }
      await loadSavedSearches();
    } catch (error) {
      setSavedError(error instanceof Error ? error.message : t("marketIntelligence.schedulerRunError"));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <form className="grid gap-3 md:grid-cols-6" onSubmit={runSearchJob}>
          <div className="md:col-span-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("marketIntelligence.queryPlaceholder")}
              aria-label={t("marketIntelligence.keyword")}
            />
          </div>

          <Input
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder={t("marketIntelligence.countryPlaceholder")}
            aria-label={t("marketIntelligence.country")}
          />

          <Select value={intent} onChange={(event) => setIntent(event.target.value as "" | SearchIntent)}>
            <option value="">{t("marketIntelligence.intentAuto")}</option>
            <option value="buyers">{t("marketIntelligence.buyers")}</option>
            <option value="suppliers">{t("marketIntelligence.suppliers")}</option>
            <option value="manufacturers">{t("marketIntelligence.manufacturers")}</option>
            <option value="importers">{t("marketIntelligence.importers")}</option>
            <option value="exporters">{t("marketIntelligence.exporters")}</option>
            <option value="rfq">{t("marketIntelligence.rfq")}</option>
            <option value="deals">{t("marketIntelligence.deals")}</option>
          </Select>

          <Input
            value={customSources}
            onChange={(event) => setCustomSources(event.target.value)}
            placeholder={t("marketIntelligence.customSourcesPlaceholder")}
            aria-label={t("marketIntelligence.customSources")}
          />

          <Button type="submit" disabled={loadingJob}>
            {loadingJob ? t("marketIntelligence.searching") : t("marketIntelligence.runJob")}
          </Button>
        </form>

        {jobError ? <p className="mt-3 text-sm text-rose-600">{jobError}</p> : null}
        {saveLinkMessage ? <p className="mt-2 text-xs text-emerald-700">{saveLinkMessage}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuery(example)}
              className="rounded-full border border-border px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {example}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>{t("marketIntelligence.savedSearches")}</CardTitle>
        <form className="mt-3 grid gap-3 md:grid-cols-5" onSubmit={createSavedSearchAction}>
          <Input
            value={savedName}
            onChange={(event) => setSavedName(event.target.value)}
            placeholder={t("marketIntelligence.savedSearchName")}
          />
          <Select value={savedFrequency} onChange={(event) => setSavedFrequency(event.target.value)}>
            <option value="12">{t("marketIntelligence.every12h")}</option>
            <option value="24">{t("marketIntelligence.daily")}</option>
            <option value="168">{t("marketIntelligence.weekly")}</option>
          </Select>
          <Button type="submit" disabled={savedLoading} className="md:col-span-1">
            {t("marketIntelligence.saveSearch")}
          </Button>
          <Button type="button" variant="secondary" onClick={runDueScheduler} className="md:col-span-1">
            <RefreshCcw size={14} className="mr-1" />
            {t("marketIntelligence.runDueNow")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void loadSavedSearches()} className="md:col-span-1">
            {t("common.refresh")}
          </Button>
        </form>

        {savedError ? <p className="mt-2 text-sm text-rose-600">{savedError}</p> : null}

        <div className="mt-3 space-y-2">
          {savedSearches.length === 0 ? (
            <p className="text-sm text-slate-500">{t("marketIntelligence.noSavedSearches")}</p>
          ) : (
            savedSearches.map((item) => (
              <div key={item.id} className="rounded-lg border border-border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{item.name}</p>
                  <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={() => void runSavedSearchAction(item.id)}>
                    {t("marketIntelligence.runNow")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {item.keyword}
                  {item.country ? ` • ${item.country}` : ""}
                  {item.intent ? ` • ${item.intent}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {t("marketIntelligence.frequency")}: {item.frequency_hours}h • {t("marketIntelligence.nextRun")}:{" "}
                  {item.next_run_at ? new Date(item.next_run_at).toLocaleString(locale === "ru" ? "ru-RU" : "en-US") : "-"}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>

      {snapshot ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("marketIntelligence.jobStatus")}</CardTitle>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${jobStatusClass(snapshot.job.status)}`}>
              {snapshot.job.status}
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.jobId")}:</span> {snapshot.job.id}
            </p>
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.jobProgress")}:</span>{" "}
              {snapshot.job.processed_sources}/{snapshot.job.total_sources}
            </p>
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.totalResults")}:</span> {snapshot.job.total_results}
            </p>
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.autoImportedLeads")}:</span>{" "}
              {snapshot.job.imported_leads}
            </p>
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.stagedRawLeads")}:</span>{" "}
              {snapshot.job.saved_raw_leads}
            </p>
            <p>
              <span className="font-medium text-slate-900">{t("marketIntelligence.lowConfidenceDropped")}:</span>{" "}
              {snapshot.job.low_confidence_dropped}
            </p>
          </div>

          {polling && (snapshot.job.status === "RUNNING" || snapshot.job.status === "PENDING") ? (
            <p className="mt-2 text-xs text-blue-700">{t("marketIntelligence.runningInBackground")}</p>
          ) : null}
        </Card>
      ) : null}

      {snapshot ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardTitle>{t("marketIntelligence.parsedQuery")}</CardTitle>
            <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.keyword")}:</span>{" "}
                {snapshot.parsed_query.query}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("common.product")}:</span>{" "}
                {snapshot.parsed_query.product || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.productCategory")}:</span>{" "}
                {snapshot.parsed_query.product_category || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.intent")}:</span>{" "}
                {snapshot.parsed_query.intent}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("common.country")}:</span>{" "}
                {snapshot.parsed_query.target_country_or_region || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.buyerCountry")}:</span>{" "}
                {snapshot.parsed_query.buyer_country || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.supplierCountry")}:</span>{" "}
                {snapshot.parsed_query.supplier_country || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.originCountry")}:</span>{" "}
                {snapshot.parsed_query.origin_country || "-"}
              </p>
              <p>
                <span className="font-medium text-slate-900">{t("marketIntelligence.destinationCountry")}:</span>{" "}
                {snapshot.parsed_query.destination_country || "-"}
              </p>
            </div>
          </Card>

          <Card>
            <CardTitle>{t("marketIntelligence.recommendedSources")}</CardTitle>
            <div className="mt-3 space-y-2">
              {snapshot.recommended_sources.map((source) => (
                <div key={source.source_id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-900">{source.source_name}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{source.score}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    {t("marketIntelligence.priorityTier")}: {source.priority_tier ? `T${source.priority_tier}` : "-"} •{" "}
                    {t("marketIntelligence.purpose")}: {source.purpose || "-"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("marketIntelligence.categoryFit")}:{" "}
                    {Array.isArray(source.product_category_fit) && source.product_category_fit.length
                      ? source.product_category_fit.join(", ")
                      : "-"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{localizeSourceReason(source.reason, t)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t("marketIntelligence.executionMode")}: {source.execution_mode} • {t("marketIntelligence.antiBotRisk")}:{" "}
                    {source.anti_bot_risk}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {diagnostics.length ? (
        <Card>
          <CardTitle>{t("marketIntelligence.sourceDiagnostics")}</CardTitle>
          <div className="mt-3 space-y-2">
            {diagnostics.map((source) => (
              <div key={source.source_id} className="rounded-lg border border-border px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{source.source_name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {source.diagnostic_code ? (
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${diagnosticCodeClass(source.diagnostic_code)}`}>
                        {t(`marketIntelligence.diagnostic.${source.diagnostic_code}`, source.diagnostic_code)}
                      </span>
                    ) : null}
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${sourceStatusClass(source.status)}`}>
                      {source.status}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                  <p>
                    {t("marketIntelligence.executionMode")}: {source.execution_mode}
                  </p>
                  <p>
                    {t("marketIntelligence.priorityTier")}: {source.priority_tier ? `T${source.priority_tier}` : "-"}
                  </p>
                  <p>
                    {t("marketIntelligence.attemptedModes")}: {source.attempted_modes.join(" -> ")}
                  </p>
                  <p>
                    {t("marketIntelligence.responseStatus")}: {source.response_status ?? "-"}
                  </p>
                  <p>
                    {t("marketIntelligence.parseStatus")}: {source.parse_status}
                  </p>
                  <p>
                    {t("marketIntelligence.extractedCount")}: {source.extracted_results}
                  </p>
                  <p>
                    {t("marketIntelligence.antiBotRisk")}: {source.anti_bot_risk}
                  </p>
                  <p>
                    {t("marketIntelligence.acquisitionPath")}:{" "}
                    {source.acquisition_path
                      ? t(`marketIntelligence.acquisition.${source.acquisition_path}`, source.acquisition_path)
                      : "-"}
                  </p>
                </div>

                {source.selection_reason ? (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-800">{t("marketIntelligence.selectedBecause")}:</span>{" "}
                    {localizeSourceReason(source.selection_reason, t)}
                  </p>
                ) : null}

                {source.warnings.length ? <p className="mt-1 text-xs text-amber-700">{source.warnings[0]}</p> : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {source.open_source_url ? (
                    <a href={source.open_source_url} target="_blank" rel="noreferrer">
                      <Button variant="secondary" className="h-8 px-3 text-xs">
                        {t("marketIntelligence.openSource")}
                      </Button>
                    </a>
                  ) : null}

                  {source.save_search_url ? (
                    <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => saveSearchLink(source.save_search_url)}>
                      <Link2 size={12} className="mr-1" />
                      {t("marketIntelligence.saveSearchLink")}
                    </Button>
                  ) : null}

                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => startManualImportFromSource(source)}>
                    {t("marketIntelligence.manualImport")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {snapshot?.warnings.length ? (
        <Card>
          <CardTitle>{t("marketIntelligence.warnings")}</CardTitle>
          <div className="mt-3 space-y-1 text-xs text-amber-700">
            {snapshot.warnings.slice(0, 12).map((warning, idx) => (
              <p key={`${warning}-${idx}`}>{warning}</p>
            ))}
          </div>
        </Card>
      ) : null}

      {showFallbackOnly || !snapshot || snapshot.job.status !== "RUNNING" ? (
        <Card>
          <CardTitle>{t("marketIntelligence.manualImportFallback")}</CardTitle>
          <form className="mt-3 space-y-3" onSubmit={runManualImport}>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={manualSourceName}
                onChange={(event) => setManualSourceName(event.target.value)}
                placeholder={t("marketIntelligence.sourceName")}
              />
              <Input
                value={manualSourceUrl}
                onChange={(event) => setManualSourceUrl(event.target.value)}
                placeholder={t("marketIntelligence.sourceUrlPlaceholder")}
              />
            </div>

            <Textarea
              value={manualPageText}
              onChange={(event) => setManualPageText(event.target.value)}
              placeholder={t("marketIntelligence.manualPageTextPlaceholder")}
              className="min-h-[160px]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={manualLoading}>
                {manualLoading ? t("marketIntelligence.manualImporting") : t("marketIntelligence.manualAnalyzeAndSave")}
              </Button>
              <p className="text-xs text-slate-500">{t("marketIntelligence.manualImportHint")}</p>
            </div>
          </form>

          {manualError ? <p className="mt-3 text-sm text-rose-600">{manualError}</p> : null}

          {manualResult ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <p>
                {manualResult.imported.status === "duplicate"
                  ? t("marketIntelligence.alreadyImported")
                  : t("marketIntelligence.importSuccessful")}
                {": "}
                {manualResult.imported.leadId}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {snapshot && !hasResults ? (
        <EmptyState title={t("marketIntelligence.noResultsFound")} description={t("marketIntelligence.noResultsDescription")} />
      ) : null}

      {hasResults ? (
        <div className="space-y-3">
          {orderedResults.map((result) => (
            <Card key={result.id} className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <CardTitle>{result.company || result.product || result.description.slice(0, 90)}</CardTitle>
                  <p className="text-xs text-slate-500">
                    {t("marketIntelligence.source")}:{" "}
                    <a className="inline-flex items-center gap-1 text-primary hover:underline" href={result.source_url} target="_blank" rel="noreferrer">
                      {result.source_name} <ExternalLink size={12} />
                    </a>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${persistenceClass(result.persistence_status)}`}>
                    {result.persistence_status}
                  </span>
                  {result.persistence_status === "staged" || result.persistence_status === "logged" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => void forceImportResult(result)}
                      disabled={forceImportingId === result.id}
                    >
                      {forceImportingId === result.id ? t("marketIntelligence.forceImporting") : t("marketIntelligence.forceImport")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.company")}:</span> {result.company || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("common.country")}:</span> {result.country || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.quantity")}:</span> {result.quantity || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.paymentTerms")}:</span> {result.payment_terms || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.shippingTerms")}:</span> {result.shipping_terms || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.destination")}:</span> {result.destination || "-"}
                </p>
                <p>
                  <span className="font-medium text-slate-900">{t("marketIntelligence.relevance")}:</span>{" "}
                  {Math.round((result.relevance_score || 0) * 100)}%
                </p>
              </div>

              {result.ai_summary ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium text-slate-900">{t("marketIntelligence.aiSummary")}:</span> {result.ai_summary}
                </p>
              ) : null}

              {forceImportState[result.id] ? <p className="text-xs text-slate-600">{forceImportState[result.id]}</p> : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
