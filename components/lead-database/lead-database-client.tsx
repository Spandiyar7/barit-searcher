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

type LeadDatabaseItem = {
  id: string;
  leadId: string;
  company: string;
  role: "buyer" | "supplier" | "importer" | "exporter" | "manufacturer" | "trader";
  country: string | null;
  city: string | null;
  product: string | null;
  volume: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  website: string | null;
  sourceName: string;
  sourceUrl: string;
  confidenceScore: number;
  rankingScore: number;
  whyMatched: string[];
  hasContact: boolean;
  hasVolume: boolean;
  searchJobId: string | null;
  createdAt: string;
};

type LeadDatabaseSnapshot = {
  job: {
    id: string;
    status: string;
    query: string;
    createdAt: string;
    parsedIntent: string;
    targetCountry: string | null;
  };
  totals: {
    readyLeads: number;
    withContacts: number;
    withVolume: number;
    averageConfidence: number;
  };
  leads: LeadDatabaseItem[];
};

type LeadDatabaseListResponse = {
  totals: {
    total: number;
    withContacts: number;
    withVolume: number;
    averageConfidence: number;
  };
  leads: LeadDatabaseItem[];
};

type ApiPayload<T> = { data?: T; error?: string };

const roleVariant = (role: LeadDatabaseItem["role"]) => {
  if (role === "buyer" || role === "importer") return "info" as const;
  if (role === "supplier" || role === "manufacturer" || role === "exporter") return "success" as const;
  return "default" as const;
};

const confidenceVariant = (score: number) => {
  if (score >= 80) return "success" as const;
  if (score >= 65) return "warning" as const;
  return "default" as const;
};

const whyKeyMap: Record<string, string> = {
  roleRelevance: "leadDatabase.why.roleRelevance",
  contactCompleteness: "leadDatabase.why.contactCompleteness",
  sourceQuality: "leadDatabase.why.sourceQuality",
  tradeSignal: "leadDatabase.why.tradeSignal",
  volumePresent: "leadDatabase.why.volumePresent",
  countryMatch: "leadDatabase.why.countryMatch",
  productMatch: "leadDatabase.why.productMatch",
  repeatedSourceSignals: "leadDatabase.why.repeatedSourceSignals"
};

export function LeadDatabaseClient({ locale }: { locale: Locale }) {
  const t = getTranslator(locale);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [intent, setIntent] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [database, setDatabase] = useState<LeadDatabaseListResponse | null>(null);
  const [snapshot, setSnapshot] = useState<LeadDatabaseSnapshot | null>(null);

  const [productFilter, setProductFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("60");
  const [hasContactFilter, setHasContactFilter] = useState("");
  const [hasVolumeFilter, setHasVolumeFilter] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDatabase = async () => {
      try {
        const response = await fetch("/api/lead-database");
        const json = (await response.json().catch(() => ({}))) as ApiPayload<LeadDatabaseListResponse>;
        if (!response.ok || !json.data) throw new Error(json.error || t("leadDatabase.loadError"));
        if (!cancelled) {
          setDatabase(json.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("leadDatabase.loadError"));
      }
    };

    void loadDatabase();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        setPolling(true);
        const response = await fetch(`/api/lead-database/jobs/${jobId}`);
        const json = (await response.json().catch(() => ({}))) as ApiPayload<LeadDatabaseSnapshot>;
        if (!response.ok || !json.data) throw new Error(json.error || t("leadDatabase.snapshotError"));
        if (cancelled) return;
        setSnapshot(json.data);
        setError(null);

        if (json.data.job.status === "PENDING" || json.data.job.status === "RUNNING") {
          timer = setTimeout(() => void poll(), 2500);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("leadDatabase.snapshotError"));
          timer = setTimeout(() => void poll(), 4000);
        }
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

  const runPipeline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) {
      setError(t("leadDatabase.queryRequired"));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/lead-database/jobs", {
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
      if (!response.ok || !json.data?.job_id) throw new Error(json.error || t("leadDatabase.createError"));
      setJobId(json.data.job_id);
      setSnapshot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("leadDatabase.createError"));
    } finally {
      setLoading(false);
    }
  };

  const items = useMemo(() => {
    return snapshot?.leads || database?.leads || [];
  }, [snapshot, database]);

  const filteredItems = useMemo(() => {
    const minConfidence = Number(confidenceFilter || "0");

    return items.filter((item) => {
      if (productFilter && !(item.product || "").toLowerCase().includes(productFilter.toLowerCase())) return false;
      if (roleFilter && item.role !== roleFilter) return false;
      if (countryFilter && !(item.country || "").toLowerCase().includes(countryFilter.toLowerCase())) return false;
      if (sourceFilter && item.sourceName !== sourceFilter) return false;
      if (Number.isFinite(minConfidence) && item.confidenceScore < minConfidence) return false;
      if (hasContactFilter === "yes" && !item.hasContact) return false;
      if (hasContactFilter === "no" && item.hasContact) return false;
      if (hasVolumeFilter === "yes" && !item.hasVolume) return false;
      if (hasVolumeFilter === "no" && item.hasVolume) return false;
      return true;
    });
  }, [items, productFilter, roleFilter, countryFilter, sourceFilter, confidenceFilter, hasContactFilter, hasVolumeFilter]);

  const sourceOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.sourceName))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const totals = snapshot
    ? {
        total: snapshot.totals.readyLeads,
        withContacts: snapshot.totals.withContacts,
        withVolume: snapshot.totals.withVolume,
        averageConfidence: snapshot.totals.averageConfidence
      }
    : {
        total: database?.totals.total || 0,
        withContacts: database?.totals.withContacts || 0,
        withVolume: database?.totals.withVolume || 0,
        averageConfidence: database?.totals.averageConfidence || 0
      };

  return (
    <div className="space-y-6">
      <Card>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={runPipeline}>
          <Input
            placeholder={t("leadDatabase.queryPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="md:col-span-2"
          />
          <Input
            placeholder={t("leadDatabase.country")}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
          <Select value={intent} onChange={(event) => setIntent(event.target.value)}>
            <option value="">{t("leadDatabase.allIntents")}</option>
            <option value="buyers">{t("leadDatabase.intent.buyers")}</option>
            <option value="suppliers">{t("leadDatabase.intent.suppliers")}</option>
            <option value="manufacturers">{t("leadDatabase.intent.manufacturers")}</option>
            <option value="importers">{t("leadDatabase.intent.importers")}</option>
            <option value="exporters">{t("leadDatabase.intent.exporters")}</option>
          </Select>
          <Button type="submit" disabled={loading} className="md:col-span-4">
            {loading ? t("leadDatabase.running") : t("leadDatabase.run")}
          </Button>
        </form>
        {snapshot ? (
          <p className="mt-3 text-xs text-slate-500">
            {t("leadDatabase.jobStatus")}: {snapshot.job.status} {polling ? ` • ${t("leadDatabase.updating")}` : ""}
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("leadDatabase.total")}</p>
          <p className="text-3xl font-bold text-slate-900">{totals.total}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("leadDatabase.withContacts")}</p>
          <p className="text-3xl font-bold text-slate-900">{totals.withContacts}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("leadDatabase.withVolume")}</p>
          <p className="text-3xl font-bold text-slate-900">{totals.withVolume}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("leadDatabase.avgConfidence")}</p>
          <p className="text-3xl font-bold text-slate-900">{totals.averageConfidence.toFixed(2)}%</p>
        </Card>
      </div>

      <Card className="space-y-4">
        <CardTitle>{t("leadDatabase.filters")}</CardTitle>
        <div className="grid gap-3 md:grid-cols-7">
          <Input placeholder={t("leadDatabase.product")} value={productFilter} onChange={(e) => setProductFilter(e.target.value)} />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">{t("leadDatabase.allRoles")}</option>
            <option value="buyer">{t("leadDatabase.role.buyer")}</option>
            <option value="supplier">{t("leadDatabase.role.supplier")}</option>
            <option value="importer">{t("leadDatabase.role.importer")}</option>
            <option value="exporter">{t("leadDatabase.role.exporter")}</option>
            <option value="manufacturer">{t("leadDatabase.role.manufacturer")}</option>
            <option value="trader">{t("leadDatabase.role.trader")}</option>
          </Select>
          <Input placeholder={t("leadDatabase.country")} value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} />
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
            <option value="">{t("leadDatabase.allSources")}</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder={t("leadDatabase.confidence")}
            value={confidenceFilter}
            onChange={(e) => setConfidenceFilter(e.target.value)}
          />
          <Select value={hasContactFilter} onChange={(e) => setHasContactFilter(e.target.value)}>
            <option value="">{t("leadDatabase.hasContactAny")}</option>
            <option value="yes">{t("leadDatabase.hasContactYes")}</option>
            <option value="no">{t("leadDatabase.hasContactNo")}</option>
          </Select>
          <Select value={hasVolumeFilter} onChange={(e) => setHasVolumeFilter(e.target.value)}>
            <option value="">{t("leadDatabase.hasVolumeAny")}</option>
            <option value="yes">{t("leadDatabase.hasVolumeYes")}</option>
            <option value="no">{t("leadDatabase.hasVolumeNo")}</option>
          </Select>
        </div>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {filteredItems.length === 0 ? (
        <EmptyState title={t("leadDatabase.emptyTitle")} description={t("leadDatabase.emptyDescription")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <Table>
            <THead>
              <TR>
                <TH>{t("leadDatabase.company")}</TH>
                <TH>{t("leadDatabase.role")}</TH>
                <TH>{t("leadDatabase.country")}</TH>
                <TH>{t("leadDatabase.product")}</TH>
                <TH>{t("leadDatabase.contactPerson")}</TH>
                <TH>{t("leadDatabase.email")}</TH>
                <TH>{t("leadDatabase.phone")}</TH>
                <TH>{t("leadDatabase.messengers")}</TH>
                <TH>{t("leadDatabase.website")}</TH>
                <TH>{t("leadDatabase.source")}</TH>
                <TH>{t("leadDatabase.confidence")}</TH>
                <TH>{t("leadDatabase.whyMatched")}</TH>
              </TR>
            </THead>
            <TBody>
              {filteredItems.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{item.company}</p>
                      <Link href={`/leads/${item.leadId}`} className="text-xs text-primary hover:underline">
                        {t("leadDatabase.openLead")}
                      </Link>
                    </div>
                  </TD>
                  <TD>
                    <Badge variant={roleVariant(item.role)}>{t(`leadDatabase.role.${item.role}`)}</Badge>
                  </TD>
                  <TD>{item.country || t("common.noData")}</TD>
                  <TD>{item.product || t("common.noData")}</TD>
                  <TD>{item.contactPerson || t("common.noData")}</TD>
                  <TD>{item.email || t("common.noData")}</TD>
                  <TD>{item.phone || t("common.noData")}</TD>
                  <TD>
                    <div className="space-y-1 text-xs">
                      <p>{item.telegram ? `TG: ${item.telegram}` : "TG: -"}</p>
                      <p>{item.whatsapp ? `WA: ${item.whatsapp}` : "WA: -"}</p>
                    </div>
                  </TD>
                  <TD>
                    {item.website ? (
                      <a href={item.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {item.website.replace(/^https?:\/\//i, "")}
                      </a>
                    ) : (
                      t("common.noData")
                    )}
                  </TD>
                  <TD>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-700">{item.sourceName}</p>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          title={item.sourceUrl}
                        >
                          {t("leadDatabase.openSource")}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">{t("common.noData")}</span>
                      )}
                    </div>
                  </TD>
                  <TD>
                    <Badge variant={confidenceVariant(item.confidenceScore)}>{item.confidenceScore.toFixed(0)}%</Badge>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {item.whyMatched.length > 0
                        ? item.whyMatched.map((code) => (
                            <Badge key={code} variant="default">
                              {t(whyKeyMap[code] || code, code)}
                            </Badge>
                          ))
                        : t("common.noData")}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
