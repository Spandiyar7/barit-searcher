"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getTranslator } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

type LeadDiscoveryRole = "buyer" | "supplier" | "importer" | "exporter" | "manufacturer" | "trader";
type WhyMatchedCode =
  | "roleMatch"
  | "countryMatch"
  | "productMatch"
  | "enrichment"
  | "sourceQuality"
  | "confidence"
  | "repeatedSignals"
  | "multiSource";

type LeadDiscoveryItem = {
  id: string;
  discoveryStage: "strong" | "probable" | "other";
  leadId: string | null;
  dealId: string | null;
  company: string;
  country: string | null;
  role: LeadDiscoveryRole;
  product: string | null;
  confidenceScore: number;
  rankingScore: number;
  sourceName: string;
  sourceUrl: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  aiExplanation: string;
  nextAction: string;
  whyMatched: WhyMatchedCode[];
  status: string;
  createdAt: string;
  rawResult: Record<string, unknown>;
};

type LeadDiscoverySnapshot = {
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
    probableCompanies: number;
    otherResults: number;
    hiddenReview: number;
    lowConfidence: number;
    imported: number;
    duplicates: number;
  };
  leads: LeadDiscoveryItem[];
};

type ApiPayload<T> = { data?: T; error?: string };
type CreateJobResponse = { job_id: string; status?: string };

const roleVariant = (role: LeadDiscoveryRole) => {
  if (role === "buyer" || role === "importer") return "info" as const;
  if (role === "supplier" || role === "manufacturer" || role === "exporter") return "success" as const;
  return "default" as const;
};

const confidenceVariant = (score: number) => {
  if (score >= 80) return "success" as const;
  if (score >= 65) return "warning" as const;
  return "default" as const;
};

const isRunningStatus = (status: string | undefined) => status === "PENDING" || status === "RUNNING";

export function LeadDiscoveryClient({ locale }: { locale: Locale }) {
  const t = useMemo(() => getTranslator(locale), [locale]);

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [intent, setIntent] = useState("");

  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LeadDiscoverySnapshot | null>(null);

  const [roleFilter, setRoleFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState("0");

  const [actionState, setActionState] = useState<Record<string, string>>({});
  const [outreachByLeadId, setOutreachByLeadId] = useState<Record<string, string>>({});

  const activeJobRef = useRef<string | null>(null);
  const pollRequestRef = useRef(0);

  const toOperatorSafeMessage = useCallback(
    (value: unknown, fallback: string) => {
      const message = value instanceof Error ? value.message : fallback;
      if (!message) return fallback;
      if (
        /(403|404|429|5\d\d|chunk|diagnostic|registry|adapter|blocked|captcha|parser|source run|trace|middleware|network|timeout)/i.test(
          message
        )
      ) {
        return `${t("leadDiscovery.limitedResults")} ${t("leadDiscovery.trySpecific")}`;
      }
      return message;
    },
    [t]
  );

  useEffect(() => {
    activeJobRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let retries = 0;
    const expectedJobId = jobId;

    const poll = async () => {
      if (cancelled || activeJobRef.current !== expectedJobId) return;

      const requestId = ++pollRequestRef.current;
      controller?.abort();
      controller = new AbortController();

      try {
        setPolling(true);
        const response = await fetch(`/api/lead-discovery/jobs/${expectedJobId}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const json = (await response.json().catch(() => ({}))) as ApiPayload<LeadDiscoverySnapshot>;

        if (!response.ok || !json.data) {
          throw new Error(json.error || t("leadDiscovery.loadError"));
        }

        if (cancelled || activeJobRef.current !== expectedJobId || requestId !== pollRequestRef.current) return;

        setSnapshot(json.data);
        setError(null);

        if (isRunningStatus(json.data.job.status)) {
          timer = setTimeout(() => void poll(), 2500);
          return;
        }

        setPolling(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (cancelled || activeJobRef.current !== expectedJobId || requestId !== pollRequestRef.current) return;

        retries += 1;
        setError(toOperatorSafeMessage(err, t("leadDiscovery.loadError")));

        if (retries < 3) {
          timer = setTimeout(() => void poll(), 3500);
        } else {
          setPolling(false);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
      setPolling(false);
    };
  }, [jobId, t, toOperatorSafeMessage]);

  const runDiscovery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submittedQuery = String(formData.get("query") ?? query).trim();
    const submittedCountry = String(formData.get("country") ?? country).trim();
    const submittedIntent = String(formData.get("intent") ?? intent).trim();

    if (!submittedQuery) {
      setError(t("leadDiscovery.queryRequired"));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/lead-discovery/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: submittedQuery,
          country: submittedCountry,
          intent: submittedIntent || undefined,
          customSources: ""
        })
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<CreateJobResponse>;
      if (!response.ok || !json.data?.job_id) throw new Error(json.error || t("leadDiscovery.createError"));

      setQuery(submittedQuery);
      setCountry(submittedCountry);
      setIntent(submittedIntent);
      setSnapshot(null);
      setJobId(json.data.job_id);
      setActionState({});
      setOutreachByLeadId({});

      setRoleFilter("");
      setCountryFilter("");
      setSourceFilter("");
      setProductFilter("");
      setConfidenceFilter("0");
    } catch (err) {
      setError(toOperatorSafeMessage(err, t("leadDiscovery.createError")));
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = useMemo(() => {
    if (!snapshot?.leads) return [];
    const minConfidence = Number(confidenceFilter || "0");
    return snapshot.leads.filter((lead) => {
      if (roleFilter && lead.role !== roleFilter) return false;
      if (countryFilter && !(lead.country || "").toLowerCase().includes(countryFilter.toLowerCase())) return false;
      if (sourceFilter && lead.sourceName !== sourceFilter) return false;
      if (productFilter && !(lead.product || "").toLowerCase().includes(productFilter.toLowerCase())) return false;
      if (Number.isFinite(minConfidence) && lead.confidenceScore < minConfidence) return false;
      return true;
    });
  }, [snapshot, roleFilter, countryFilter, sourceFilter, productFilter, confidenceFilter]);

  const sourceOptions = useMemo(() => {
    if (!snapshot) return [];
    return Array.from(new Set(snapshot.leads.map((item) => item.sourceName))).sort((a, b) => a.localeCompare(b));
  }, [snapshot]);

  const persistedSummary = useMemo(() => {
    if (!snapshot || isRunningStatus(snapshot.job.status)) return null;

    const leadSavedCount = snapshot.leads.filter((item) => Boolean(item.leadId)).length;
    const companySavedCount = new Set(snapshot.leads.map((item) => item.company.trim()).filter(Boolean)).size;
    const contactSavedCount = snapshot.leads.filter((item) => Boolean(item.contactName || item.contactEmail || item.contactPhone)).length;

    return {
      leadSavedCount,
      companySavedCount,
      contactSavedCount
    };
  }, [snapshot]);

  const postJson = async (url: string, payload: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = (await response.json().catch(() => ({}))) as ApiPayload<Record<string, unknown>>;
    if (!response.ok) throw new Error(json.error || t("leadDiscovery.actionFailed"));
    return json.data || {};
  };

  const onAssignManager = async (lead: LeadDiscoveryItem) => {
    if (!lead.leadId) return;
    const manager = window.prompt(t("leadDiscovery.managerPrompt"));
    if (!manager || manager.trim().length < 2) return;
    try {
      await postJson("/api/lead-discovery/actions/assign", { leadId: lead.leadId, manager: manager.trim() });
      setActionState((prev) => ({ ...prev, [lead.id]: t("leadDiscovery.assigned") }));
    } catch (err) {
      setActionState((prev) => ({ ...prev, [lead.id]: toOperatorSafeMessage(err, t("leadDiscovery.actionFailed")) }));
    }
  };

  const onMarkContacted = async (lead: LeadDiscoveryItem) => {
    if (!lead.leadId) return;
    try {
      await postJson("/api/lead-discovery/actions/contacted", { leadId: lead.leadId });
      setActionState((prev) => ({ ...prev, [lead.id]: t("leadDiscovery.contacted") }));
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              leads: prev.leads.map((item) => (item.id === lead.id ? { ...item, status: "CONTACTED" } : item))
            }
          : prev
      );
    } catch (err) {
      setActionState((prev) => ({ ...prev, [lead.id]: toOperatorSafeMessage(err, t("leadDiscovery.actionFailed")) }));
    }
  };

  const onGenerateOutreach = async (lead: LeadDiscoveryItem) => {
    if (!lead.leadId) return;
    try {
      const data = await postJson("/api/lead-discovery/actions/outreach", { leadId: lead.leadId });
      const message = typeof data.message === "string" ? data.message : t("leadDiscovery.noOutreach");
      setOutreachByLeadId((prev) => ({ ...prev, [lead.id]: message }));
    } catch (err) {
      setActionState((prev) => ({ ...prev, [lead.id]: toOperatorSafeMessage(err, t("leadDiscovery.actionFailed")) }));
    }
  };

  const onConvertToDeal = async (lead: LeadDiscoveryItem) => {
    if (!lead.leadId) return;
    try {
      const response = await fetch(`/api/leads/${lead.leadId}/convert`, { method: "POST" });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<{ id: string }>;
      if (!response.ok || !json.data?.id) throw new Error(json.error || t("leadDiscovery.actionFailed"));
      const dealId = json.data.id;
      setActionState((prev) => ({ ...prev, [lead.id]: `${t("leadDiscovery.dealCreated")} #${dealId}` }));
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              leads: prev.leads.map((item) => (item.id === lead.id ? { ...item, dealId } : item))
            }
          : prev
      );
    } catch (err) {
      setActionState((prev) => ({ ...prev, [lead.id]: toOperatorSafeMessage(err, t("leadDiscovery.actionFailed")) }));
    }
  };

  const onSaveLead = async (lead: LeadDiscoveryItem) => {
    if (lead.leadId) return;
    try {
      const response = await fetch("/api/market-intelligence/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: lead.rawResult,
          save_company: true,
          with_ai: false
        })
      });
      const json = (await response.json().catch(() => ({}))) as ApiPayload<{ leadId?: string }>;
      if (!response.ok || !json.data?.leadId) throw new Error(json.error || t("leadDiscovery.actionFailed"));
      const savedLeadId = json.data.leadId;
      setActionState((prev) => ({ ...prev, [lead.id]: t("leadDiscovery.saved") }));
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              leads: prev.leads.map((item) => (item.id === lead.id ? { ...item, leadId: savedLeadId || null } : item))
            }
          : prev
      );
    } catch (err) {
      setActionState((prev) => ({ ...prev, [lead.id]: toOperatorSafeMessage(err, t("leadDiscovery.actionFailed")) }));
    }
  };

  const showNoCompanyResults =
    persistedSummary &&
    (snapshot?.leads.length || 0) === 0 &&
    persistedSummary.companySavedCount === 0 &&
    persistedSummary.leadSavedCount === 0;
  const isJobActive = snapshot ? isRunningStatus(snapshot.job.status) : false;
  const hasDiscoveryCandidates = Boolean(snapshot && snapshot.leads.length > 0);

  return (
    <div className="space-y-6">
      <Card>
        <form className="grid gap-3 md:grid-cols-4" onSubmit={runDiscovery}>
          <Input
            name="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("leadDiscovery.queryPlaceholder")}
            className="md:col-span-2"
          />
          <Input
            name="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            placeholder={t("leadDiscovery.country")}
          />
          <Select name="intent" value={intent} onChange={(event) => setIntent(event.target.value)}>
            <option value="">{t("leadDiscovery.allIntents")}</option>
            <option value="buyers">{t("leadDiscovery.roleBuyer")}</option>
            <option value="suppliers">{t("leadDiscovery.roleSupplier")}</option>
            <option value="manufacturers">{t("leadDiscovery.roleManufacturer")}</option>
            <option value="importers">{t("leadDiscovery.roleImporter")}</option>
            <option value="exporters">{t("leadDiscovery.roleExporter")}</option>
            <option value="rfq">RFQ</option>
          </Select>
          <Button type="submit" disabled={loading} className="md:col-span-4">
            {loading ? t("leadDiscovery.running") : t("leadDiscovery.runDiscovery")}
          </Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">{t("leadDiscovery.examples")}</p>
        {polling ? <p className="mt-2 text-xs text-slate-500">{t("leadDiscovery.searchingNow")}</p> : null}
      </Card>

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      ) : null}

      {snapshot ? (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardTitle>{t("leadDiscovery.strongLeads")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.readyLeads}</p>
          </Card>
          <Card>
            <CardTitle>{t("leadDiscovery.probableCompanies")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.probableCompanies}</p>
          </Card>
          <Card>
            <CardTitle>{t("leadDiscovery.otherResults", "Other results")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.otherResults}</p>
          </Card>
          <Card>
            <CardTitle>{t("leadDiscovery.imported")}</CardTitle>
            <p className="mt-3 text-2xl font-bold">{snapshot.totals.imported}</p>
          </Card>
          <Card>
            <CardTitle>{t("leadDiscovery.status")}</CardTitle>
            <p className="mt-3 text-sm font-semibold">{snapshot.job.status}</p>
            <p className="text-xs text-slate-500">{polling ? t("leadDiscovery.updating") : t("leadDiscovery.stable")}</p>
          </Card>
        </div>
      ) : null}

      {persistedSummary ? (
        <Card>
          {showNoCompanyResults ? (
            <p className="text-sm font-medium text-slate-700">{t("leadDiscovery.noCompanyResultsFound")}</p>
          ) : (
            <div className="grid gap-3 text-sm text-slate-700 md:grid-cols-5">
              <p>
                {t("leadDiscovery.savedToLeadDatabase")}: <strong>{snapshot?.leads.length || 0}</strong>
              </p>
              <p>
                {t("leadDiscovery.probableCompanies")}: <strong>{snapshot?.totals.probableCompanies || 0}</strong>
              </p>
              <p>
                {t("leadDiscovery.savedToCompanies")}: <strong>{persistedSummary.companySavedCount}</strong>
              </p>
              <p>
                {t("leadDiscovery.savedToContacts")}: <strong>{persistedSummary.contactSavedCount}</strong>
              </p>
              <p>
                {t("leadDiscovery.savedToLeads")}: <strong>{persistedSummary.leadSavedCount}</strong>
              </p>
            </div>
          )}
        </Card>
      ) : null}

      {snapshot ? (
        <Card>
          <div className="grid gap-3 md:grid-cols-5">
            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">{t("leadDiscovery.allRoles")}</option>
              <option value="buyer">{t("leadDiscovery.roleBuyer")}</option>
              <option value="supplier">{t("leadDiscovery.roleSupplier")}</option>
              <option value="manufacturer">{t("leadDiscovery.roleManufacturer")}</option>
              <option value="importer">{t("leadDiscovery.roleImporter")}</option>
              <option value="exporter">{t("leadDiscovery.roleExporter")}</option>
              <option value="trader">{t("leadDiscovery.roleTrader")}</option>
            </Select>
            <Input value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)} placeholder={t("leadDiscovery.country")} />
            <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">{t("leadDiscovery.allSources")}</option>
              {sourceOptions.map((source) => (
                <option value={source} key={source}>
                  {source}
                </option>
              ))}
            </Select>
            <Input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} placeholder={t("leadDiscovery.product")} />
            <Input
              value={confidenceFilter}
              onChange={(event) => setConfidenceFilter(event.target.value)}
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder={t("leadDiscovery.minConfidence")}
            />
          </div>
        </Card>
      ) : null}

      {!snapshot ? (
        <EmptyState title={t("leadDiscovery.emptyTitle")} description={t("leadDiscovery.emptyDescription")} />
      ) : isJobActive && !hasDiscoveryCandidates ? (
        <EmptyState title={t("leadDiscovery.running")} description={t("leadDiscovery.searchingNow")} />
      ) : filteredLeads.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            title={hasDiscoveryCandidates ? t("leadDiscovery.noMatches") : t("leadDiscovery.noCompanyResultsFound")}
            description={hasDiscoveryCandidates ? t("leadDiscovery.noMatchesDescription") : t("leadDiscovery.trySpecific")}
          />
          <div className="flex justify-center">
            <Link href="/market-intelligence">
              <Button variant="secondary">{t("leadDiscovery.openFallbackSearch")}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {snapshot.totals.readyLeads === 0 && snapshot.totals.probableCompanies > 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("leadDiscovery.showingProbableOnly")}
            </p>
          ) : null}
          {snapshot.totals.readyLeads === 0 &&
          snapshot.totals.probableCompanies === 0 &&
          snapshot.totals.otherResults > 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {t("leadDiscovery.showingOtherResults", "Showing other market results while stronger matches are not available yet.")}
            </p>
          ) : null}
          {filteredLeads.map((lead) => (
            <Card key={lead.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">{lead.company}</h3>
                    <Badge variant={roleVariant(lead.role)}>{t(`leadDiscovery.role.${lead.role}`)}</Badge>
                    <Badge
                      variant={
                        lead.discoveryStage === "strong"
                          ? "success"
                          : lead.discoveryStage === "probable"
                            ? "warning"
                            : "default"
                      }
                    >
                      {lead.discoveryStage === "strong"
                        ? t("leadDiscovery.strongLead")
                        : lead.discoveryStage === "probable"
                          ? t("leadDiscovery.probableCandidate")
                          : t("leadDiscovery.otherResult", "Other result")}
                    </Badge>
                    <Badge variant={confidenceVariant(lead.confidenceScore)}>
                      {t("leadDiscovery.confidence")} {lead.confidenceScore.toFixed(0)}%
                    </Badge>
                    <Badge variant="info">
                      {t("leadDiscovery.rank")} {lead.rankingScore.toFixed(0)}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    {lead.product || "-"} • {lead.country || "-"} • {lead.sourceName}
                  </p>
                  <p className="text-sm text-slate-700">{lead.aiExplanation}</p>
                </div>
                <Link
                  href={lead.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink size={14} />
                  {t("leadDiscovery.openSource")}
                </Link>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">{t("leadDiscovery.contact")}:</span> {lead.contactName || "-"}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Email:</span> {lead.contactEmail || "-"}
                </p>
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-800">Phone:</span> {lead.contactPhone || "-"}
                </p>
              </div>

              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{t("leadDiscovery.nextAction")}:</span> {lead.nextAction}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {lead.whyMatched.map((reason) => (
                  <Badge key={`${lead.id}-${reason}`} variant="default">
                    {t(`leadDiscovery.why.${reason}`)}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {lead.leadId ? (
                  <Link href={`/leads/${lead.leadId}`}>
                    <Button variant="secondary">{t("leadDiscovery.saved")}</Button>
                  </Link>
                ) : (
                  <Button variant="secondary" onClick={() => void onSaveLead(lead)}>
                    {t("leadDiscovery.saveToCrm")}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void onAssignManager(lead)} disabled={!lead.leadId}>
                  {t("leadDiscovery.assignManager")}
                </Button>
                <Button variant="ghost" onClick={() => void onGenerateOutreach(lead)} disabled={!lead.leadId}>
                  {t("leadDiscovery.generateOutreach")}
                </Button>
                <Button variant="ghost" onClick={() => void onMarkContacted(lead)} disabled={!lead.leadId}>
                  {t("leadDiscovery.markContacted")}
                </Button>
                <Button variant="primary" onClick={() => void onConvertToDeal(lead)} disabled={!lead.leadId}>
                  {t("leadDiscovery.convertToDeal")}
                </Button>
              </div>

              {actionState[lead.id] ? <p className="text-xs text-slate-500">{actionState[lead.id]}</p> : null}

              {outreachByLeadId[lead.id] ? (
                <div className="rounded-lg border border-border bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t("leadDiscovery.outreachDraft")}
                  </p>
                  <pre className="whitespace-pre-wrap text-xs text-slate-700">{outreachByLeadId[lead.id]}</pre>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
