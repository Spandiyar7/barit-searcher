"use client";

import { useState } from "react";
import { LeadType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { type Locale } from "@/lib/i18n/config";

type Draft = {
  title: string;
  productName: string;
  leadType: LeadType;
  volume: string;
  unit: string;
  price: string;
  currency: string;
  incoterms: string;
  originCountry: string;
  destinationCountry: string;
};

export function AILeadAnalyzer({ locale = "en" }: { locale?: Locale }) {
  const t = getTranslator(locale);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>("");

  const [draft, setDraft] = useState<Draft>({
    title: "",
    productName: "",
    leadType: "INQUIRY",
    volume: "",
    unit: "",
    price: "",
    currency: "",
    incoterms: "",
    originCountry: "",
    destinationCountry: ""
  });

  const [summary, setSummary] = useState("");
  const [actions, setActions] = useState<string[]>([]);

  const updateDraft = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const analyze = async () => {
    setError(null);
    setMeta("");
    if (!rawText.trim()) {
      setError(t("ai.pasteInquiryFirst"));
      return;
    }

    try {
      setLoading(true);
      const response = await fetch("/api/ai/parse-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || t("ai.failedToAnalyze"));
      }

      const payload = (await response.json()) as {
        data: {
          parsed: {
            title: string;
            productName: string;
            leadType: LeadType;
            volume: number | null;
            unit: string | null;
            price: number | null;
            currency: string | null;
            incoterms: string | null;
            originCountry: string | null;
            destinationCountry: string | null;
            confidence: number;
          };
          ai: { provider: string; configured: boolean };
        };
      };

      const parsed = payload.data.parsed;
      setDraft({
        title: parsed.title || "",
        productName: parsed.productName || "",
        leadType: parsed.leadType,
        volume: parsed.volume?.toString() || "",
        unit: parsed.unit || "",
        price: parsed.price?.toString() || "",
        currency: parsed.currency || "",
        incoterms: parsed.incoterms || "",
        originCountry: parsed.originCountry || "",
        destinationCountry: parsed.destinationCountry || ""
      });
      setMeta(
        payload.data.ai.configured
          ? t("ai.parsedWithConfidence")
              .replace("{{provider}}", payload.data.ai.provider)
              .replace("{{confidence}}", String(Math.round(parsed.confidence * 100)))
          : t("ai.fallbackParser")
      );
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : t("ai.failedToAnalyze"));
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setError(null);
    try {
      setSummaryLoading(true);
      const response = await fetch("/api/ai/summarize-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          rawText,
          product: draft.productName,
          leadType: draft.leadType,
          volume: draft.volume || null,
          unit: draft.unit || null,
          price: draft.price || null,
          currency: draft.currency || null,
          incoterms: draft.incoterms || null,
          originCountry: draft.originCountry || null,
          destinationCountry: draft.destinationCountry || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || t("ai.failedToSummarize"));
      }

      const payload = (await response.json()) as { data: { summary: string } };
      setSummary(payload.data.summary);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : t("ai.failedToSummarize"));
    } finally {
      setSummaryLoading(false);
    }
  };

  const generateActions = async () => {
    setError(null);
    try {
      setActionsLoading(true);
      const response = await fetch("/api/ai/suggest-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          rawText,
          product: draft.productName,
          leadType: draft.leadType,
          volume: draft.volume || null,
          unit: draft.unit || null,
          price: draft.price || null,
          currency: draft.currency || null,
          incoterms: draft.incoterms || null,
          originCountry: draft.originCountry || null,
          destinationCountry: draft.destinationCountry || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || t("ai.failedToSuggest"));
      }

      const payload = (await response.json()) as { data: { actions: string[] } };
      setActions(payload.data.actions);
    } catch (actionsError) {
      setError(actionsError instanceof Error ? actionsError.message : t("ai.failedToSuggest"));
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <FormField label={t("ai.rawInquiryText")} htmlFor="intelligenceRaw" required>
          <Textarea
            id="intelligenceRaw"
            rows={8}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder={t("ai.pastePrompt")}
          />
        </FormField>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={analyze} disabled={loading}>
            {loading ? t("ai.analyzing") : t("ai.analyzeWithAi")}
          </Button>
          <Button type="button" variant="secondary" onClick={generateSummary} disabled={summaryLoading}>
            {summaryLoading ? t("ai.summarizing") : t("ai.summarizeLead")}
          </Button>
          <Button type="button" variant="secondary" onClick={generateActions} disabled={actionsLoading}>
            {actionsLoading ? t("ai.thinking") : t("ai.suggestNextActions")}
          </Button>
        </div>
        {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </Card>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">{t("ai.extractedFields")}</h3>
        <FormGrid>
          <FormField label={t("ai.title")} htmlFor="draftTitle">
            <Input id="draftTitle" value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} />
          </FormField>
          <FormField label={t("ai.product")} htmlFor="draftProduct">
            <Input
              id="draftProduct"
              value={draft.productName}
              onChange={(e) => updateDraft("productName", e.target.value)}
            />
          </FormField>
          <FormField label={t("ai.leadType")} htmlFor="draftType">
            <Select
              id="draftType"
              value={draft.leadType}
              onChange={(e) => updateDraft("leadType", e.target.value as LeadType)}
            >
              {Object.values(LeadType).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("ai.volume")} htmlFor="draftVolume">
            <Input id="draftVolume" value={draft.volume} onChange={(e) => updateDraft("volume", e.target.value)} />
          </FormField>
          <FormField label={t("ai.unit")} htmlFor="draftUnit">
            <Input id="draftUnit" value={draft.unit} onChange={(e) => updateDraft("unit", e.target.value)} />
          </FormField>
          <FormField label={t("ai.price")} htmlFor="draftPrice">
            <Input id="draftPrice" value={draft.price} onChange={(e) => updateDraft("price", e.target.value)} />
          </FormField>
          <FormField label={t("ai.currency")} htmlFor="draftCurrency">
            <Input
              id="draftCurrency"
              value={draft.currency}
              onChange={(e) => updateDraft("currency", e.target.value)}
            />
          </FormField>
          <FormField label={t("ai.incoterms")} htmlFor="draftIncoterms">
            <Input
              id="draftIncoterms"
              value={draft.incoterms}
              onChange={(e) => updateDraft("incoterms", e.target.value)}
            />
          </FormField>
          <FormField label={t("ai.origin")} htmlFor="draftOrigin">
            <Input
              id="draftOrigin"
              value={draft.originCountry}
              onChange={(e) => updateDraft("originCountry", e.target.value)}
            />
          </FormField>
          <FormField label={t("ai.destination")} htmlFor="draftDestination">
            <Input
              id="draftDestination"
              value={draft.destinationCountry}
              onChange={(e) => updateDraft("destinationCountry", e.target.value)}
            />
          </FormField>
        </FormGrid>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">{t("ai.aiSummary")}</h3>
        <p className="mt-2 text-sm text-slate-700">{summary || t("ai.noSummaryYet")}</p>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-slate-800">{t("ai.nextActions")}</h3>
        {actions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-700">{t("ai.noActionsYet")}</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {actions.map((action, index) => (
              <li key={`${action}-${index}`}>{action}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
