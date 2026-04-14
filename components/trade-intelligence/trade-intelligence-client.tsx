"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type TradeRole = "importer" | "exporter" | "buyer" | "supplier" | "manufacturer" | "trader";
type TradeSignalType = "importer_signal" | "exporter_signal" | "recurring_buyer_signal";

type TradeIntelligenceItem = {
  id: string;
  leadId: string | null;
  company: string;
  country: string | null;
  role: TradeRole;
  product: string | null;
  confidenceScore: number;
  explanation: string;
  sourceName: string;
  sourceUrl: string;
  signalType: TradeSignalType;
  repeatedSignals: boolean;
  multiSource: boolean;
};

type TradeIntelligenceSnapshot = {
  job: {
    id: string;
    status: string;
    query: string;
    createdAt: string;
    parsedIntent: string;
    targetCountry: string | null;
  };
  totals: {
    companies: number;
    signals: number;
    repeatedCompanies: number;
    multiSourceCompanies: number;
  };
  items: TradeIntelligenceItem[];
};

type ApiPayload<T> = { data?: T; error?: string };

const roleVariant = (role: TradeRole) => {
  if (role === "importer" || role === "buyer") return "info" as const;
  if (role === "exporter" || role === "supplier" || role === "manufacturer") return "success" as const;
  return "default" as const;
};

const signalVariant = (signal: TradeSignalType) => {
  if (signal === "recurring_buyer_signal") return "warning" as const;
  if (signal === "importer_signal") return "info" as const;
  return "success" as const;
};

export function TradeIntelligenceClient({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TradeIntelligenceSnapshot | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("70");

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        setPolling(true);
        const response = await fetch(`/api/trade-intelligence/jobs/${jobId}`);
        const json = (await response.json().catch(() => ({}))) as ApiPayload<TradeIntelligenceSnapshot>;
        if (!response.ok || !json.data) throw new Error(json.error || t("tradeIntelligence.loadError"));

        if (cancelled) return;
        setSnapshot(json.data);
        setError(null);

        if (json.data.job.status === "PENDING" || json.data.job.status === "RUNNING") {
          timer = setTimeout(() => void poll(), 2500);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("tradeIntelligence.loadError"));
        timer = setTimeout(() => void poll(), 4000);
      } finally {
        if (!cancelled) setPolling(false);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, t]);

  const runSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) {
      setError(t("tradeIntelligence.queryRequired"));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/trade-intelligence/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query.trim(),
          country: country.trim(),
          intent: intent || undefined,
          customSources: ""
        })
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<{ job_id: string }>;
      if (!response.ok || !json.data?.job_id) throw new Error(json.error || t("tradeIntelligence.createError"));
      setSnapshot(null);
      setJobId(json.data.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tradeIntelligence.createError"));
    } finally {
      setLoading(false);
    }
  };

  const sourceOptions = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Set(snapshot.items.map((item) => item.sourceName))).sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const filteredItems = useMemo(() => {
    if (!snapshot) return [];
    const minConfidence = Number(confidenceFilter || "0");
    return snapshot.items.filter((item) => {
      if (roleFilter && item.role !== roleFilter) return false;
      if (countryFilter && !(item.country || "").toLowerCase().includes(countryFilter.toLowerCase())) return false;
      if (sourceFilter && item.sourceName !== sourceFilter) return false;
      if (productFilter && !(item.product || "").toLowerCase().includes(productFilter.toLowerCase())) return false;
      if (Number.isFinite(minConfidence) && item.confidenceScore < minConfidence) return false;
      return true;
    });
  }, [snapshot, roleFilter, countryFilter, sourceFilter, productFilter, confidenceFilter]);

  return (
    <div className="space-y-6">
      <Card>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={runSearch}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tradeIntelligence.queryPlaceholder")}
            className="md:col-span-2"
          />
          <Input value={country} onChange={(event) => setCountry(event.target.value)} placeholder={t("tradeIntelligence.country")} />
          <Select value={intent} onChange={(event) => setIntent(event.target.value)}>
            <option value="">{t("tradeIntelligence.allIntents")}</option>
            <option value="importers">{t("tradeIntelligence.importerIntent")}</option>
            <option value="exporters">{t("tradeIntelligence.exporterIntent")}</option>
            <option value="buyers">{t("tradeIntelligence.buyerIntent")}</option>
            <option value="manufacturers">{t("tradeIntelligence.manufacturerIntent")}</option>
          </Select>
          <Button type="submit" disabled={loading} className="md:col-span-4">
            {loading ? t("tradeIntelligence.running") : t("tradeIntelligence.run")}
          </Button>
        </form>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {snapshot ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardTitle>{t("tradeIntelligence.companies")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.companies}</p>
          </Card>
          <Card>
            <CardTitle>{t("tradeIntelligence.signals")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.signals}</p>
          </Card>
          <Card>
            <CardTitle>{t("tradeIntelligence.repeated")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.repeatedCompanies}</p>
          </Card>
          <Card>
            <CardTitle>{t("tradeIntelligence.status")}</CardTitle>
            <p className="mt-3 text-sm font-semibold">{snapshot.job.status}</p>
            <p className="text-xs text-slate-500">{polling ? t("tradeIntelligence.updating") : t("tradeIntelligence.stable")}</p>
          </Card>
        </div>
      ) : null}

      {snapshot ? (
        <Card>
          <div className="grid gap-3 md:grid-cols-5">
            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">{t("tradeIntelligence.allRoles")}</option>
              <option value="importer">{t("tradeIntelligence.role.importer")}</option>
              <option value="exporter">{t("tradeIntelligence.role.exporter")}</option>
              <option value="buyer">{t("tradeIntelligence.role.buyer")}</option>
              <option value="supplier">{t("tradeIntelligence.role.supplier")}</option>
              <option value="manufacturer">{t("tradeIntelligence.role.manufacturer")}</option>
              <option value="trader">{t("tradeIntelligence.role.trader")}</option>
            </Select>
            <Input value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} placeholder={t("tradeIntelligence.country")} />
            <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">{t("tradeIntelligence.allSources")}</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </Select>
            <Input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder={t("tradeIntelligence.product")} />
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={confidenceFilter}
              onChange={(event) => setConfidenceFilter(event.target.value)}
              placeholder={t("tradeIntelligence.minConfidence")}
            />
          </div>
        </Card>
      ) : null}

      {!snapshot ? (
        <EmptyState title={t("tradeIntelligence.emptyTitle")} description={t("tradeIntelligence.emptyDescription")} />
      ) : filteredItems.length === 0 ? (
        <EmptyState title={t("tradeIntelligence.noMatches")} description={t("tradeIntelligence.noMatchesDescription")} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto crm-scrollbar">
            <Table>
              <THead>
                <TR>
                  <TH>{t("tradeIntelligence.company")}</TH>
                  <TH>{t("tradeIntelligence.country")}</TH>
                  <TH>{t("tradeIntelligence.role")}</TH>
                  <TH>{t("tradeIntelligence.product")}</TH>
                  <TH>{t("tradeIntelligence.signal")}</TH>
                  <TH>{t("tradeIntelligence.confidence")}</TH>
                  <TH>{t("tradeIntelligence.explanation")}</TH>
                  <TH>{t("tradeIntelligence.source")}</TH>
                </TR>
              </THead>
              <TBody>
                {filteredItems.map((item) => (
                  <TR key={item.id}>
                    <TD>{item.company}</TD>
                    <TD>{item.country || "-"}</TD>
                    <TD>
                      <Badge variant={roleVariant(item.role)}>{t(`tradeIntelligence.role.${item.role}`)}</Badge>
                    </TD>
                    <TD>{item.product || "-"}</TD>
                    <TD>
                      <Badge variant={signalVariant(item.signalType)}>{t(`tradeIntelligence.signal.${item.signalType}`)}</Badge>
                    </TD>
                    <TD>{item.confidenceScore.toFixed(0)}%</TD>
                    <TD className="max-w-[360px]">
                      <p className="line-clamp-3 text-sm text-slate-600">{item.explanation}</p>
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-slate-600">{item.sourceName}</p>
                        <Link
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink size={12} />
                          {t("tradeIntelligence.openSource")}
                        </Link>
                        {item.leadId ? (
                          <Link href={`/leads/${item.leadId}`}>
                            <Button variant="secondary" className="h-8 px-3 text-xs">
                              {t("tradeIntelligence.openLead")}
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

