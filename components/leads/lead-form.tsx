"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LeadPriority, LeadStatus, LeadType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

type ProductOption = { id: string; name: string };
type CompanyOption = { id: string; name: string };

type LeadFormData = {
  id?: string;
  title: string;
  productId: string;
  companyId: string;
  leadType: LeadType;
  volume: string;
  unit: string;
  price: string;
  currency: string;
  incoterms: string;
  originCountry: string;
  destinationCountry: string;
  sourceName: string;
  sourceUrl: string;
  rawText: string;
  aiSummary: string;
  priority: LeadPriority;
  status: LeadStatus;
  publishedAt: string;
};

type AiParseResult = {
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
  matchedProduct: ProductOption | null;
  ai: {
    provider: string;
    configured: boolean;
  };
};

export function LeadForm({
  products,
  companies,
  initialData,
  redirectTo = "/leads"
}: {
  products: ProductOption[];
  companies: CompanyOption[];
  initialData?: LeadFormData;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [form, setForm] = useState<LeadFormData>(
    initialData || {
      title: "",
      productId: products[0]?.id || "",
      companyId: "",
      leadType: "INQUIRY",
      volume: "",
      unit: "MT",
      price: "",
      currency: "USD",
      incoterms: "",
      originCountry: "",
      destinationCountry: "",
      sourceName: "Manual Entry",
      sourceUrl: "",
      rawText: "",
      aiSummary: "",
      priority: "MEDIUM",
      status: "NEW",
      publishedAt: ""
    }
  );

  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string>("");

  const productName = useMemo(
    () => products.find((product) => product.id === form.productId)?.name || "",
    [products, form.productId]
  );

  const update = <K extends keyof LeadFormData>(key: K, value: LeadFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onAnalyze = async () => {
    setError(null);
    setAiMessage("");

    if (!form.rawText.trim()) {
      setError("Paste lead raw text first");
      return;
    }

    try {
      setAnalyzing(true);
      const response = await fetch("/api/ai/parse-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: form.rawText })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "AI analysis failed");
      }

      const payload = (await response.json()) as { data: AiParseResult };
      const data = payload.data;

      setForm((prev) => ({
        ...prev,
        title: data.parsed.title || prev.title,
        productId: data.matchedProduct?.id || prev.productId,
        leadType: data.parsed.leadType || prev.leadType,
        volume: data.parsed.volume !== null ? String(data.parsed.volume) : prev.volume,
        unit: data.parsed.unit || prev.unit,
        price: data.parsed.price !== null ? String(data.parsed.price) : prev.price,
        currency: data.parsed.currency || prev.currency,
        incoterms: data.parsed.incoterms || prev.incoterms,
        originCountry: data.parsed.originCountry || prev.originCountry,
        destinationCountry: data.parsed.destinationCountry || prev.destinationCountry
      }));

      setAiMessage(
        data.ai.configured
          ? `AI parsed with ${data.ai.provider} (confidence ${Math.round(data.parsed.confidence * 100)}%)`
          : "AI key not configured. Using smart fallback parser."
      );
      setMode("structured");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const onSummarize = async () => {
    setError(null);
    setAiMessage("");

    if (!form.rawText.trim()) {
      setError("Add raw text to generate AI summary");
      return;
    }

    try {
      setSummarizing(true);
      const response = await fetch("/api/ai/summarize-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          rawText: form.rawText,
          product: productName,
          leadType: form.leadType,
          volume: form.volume || null,
          unit: form.unit || null,
          price: form.price || null,
          currency: form.currency || null,
          incoterms: form.incoterms || null,
          originCountry: form.originCountry || null,
          destinationCountry: form.destinationCountry || null
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Could not generate summary");
      }

      const payload = (await response.json()) as {
        data: { summary: string; ai: { provider: string; configured: boolean } };
      };
      setForm((prev) => ({ ...prev, aiSummary: payload.data.summary }));
      setAiMessage(
        payload.data.ai.configured
          ? `Summary generated by ${payload.data.ai.provider}`
          : "AI key not configured. Summary generated by fallback."
      );
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Could not generate summary");
    } finally {
      setSummarizing(false);
    }
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setLoading(true);
      const endpoint = form.id ? `/api/leads/${form.id}` : "/api/leads";
      const method = form.id ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          companyId: form.companyId || null,
          publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : ""
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to save lead");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save lead");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "structured" ? "primary" : "secondary"}
            onClick={() => setMode("structured")}
          >
            Structured Mode
          </Button>
          <Button
            type="button"
            variant={mode === "raw" ? "primary" : "secondary"}
            onClick={() => setMode("raw")}
          >
            Raw Text + AI Mode
          </Button>
        </div>

        {mode === "raw" ? (
          <div className="space-y-3">
            <FormField label="Raw Inquiry / Offer Text" htmlFor="rawText" required>
              <Textarea
                id="rawText"
                rows={10}
                value={form.rawText}
                onChange={(event) => update("rawText", event.target.value)}
                placeholder="Paste WhatsApp message, email, website inquiry, broker note, etc"
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? "Analyzing..." : "Analyze with AI"}
              </Button>
              <Button type="button" variant="secondary" onClick={onSummarize} disabled={summarizing}>
                {summarizing ? "Generating..." : "Generate AI Summary"}
              </Button>
            </div>
          </div>
        ) : null}

        <FormGrid>
          <FormField label="Lead Title" htmlFor="title" required>
            <Input id="title" value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </FormField>
          <FormField label="Product" htmlFor="productId" required>
            <Select id="productId" value={form.productId} onChange={(e) => update("productId", e.target.value)}>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Lead Type" htmlFor="leadType" required>
            <Select id="leadType" value={form.leadType} onChange={(e) => update("leadType", e.target.value as LeadType)}>
              {Object.values(LeadType).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Company" htmlFor="companyId">
            <Select id="companyId" value={form.companyId} onChange={(e) => update("companyId", e.target.value)}>
              <option value="">Unlinked</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Volume" htmlFor="volume">
            <Input id="volume" value={form.volume} onChange={(e) => update("volume", e.target.value)} />
          </FormField>
          <FormField label="Unit" htmlFor="unit">
            <Input id="unit" value={form.unit} onChange={(e) => update("unit", e.target.value)} />
          </FormField>
          <FormField label="Price" htmlFor="price">
            <Input id="price" value={form.price} onChange={(e) => update("price", e.target.value)} />
          </FormField>
          <FormField label="Currency" htmlFor="currency">
            <Input id="currency" value={form.currency} onChange={(e) => update("currency", e.target.value)} />
          </FormField>
          <FormField label="Incoterms" htmlFor="incoterms">
            <Input id="incoterms" value={form.incoterms} onChange={(e) => update("incoterms", e.target.value)} />
          </FormField>
          <FormField label="Origin Country" htmlFor="originCountry">
            <Input
              id="originCountry"
              value={form.originCountry}
              onChange={(e) => update("originCountry", e.target.value)}
            />
          </FormField>
          <FormField label="Destination Country" htmlFor="destinationCountry">
            <Input
              id="destinationCountry"
              value={form.destinationCountry}
              onChange={(e) => update("destinationCountry", e.target.value)}
            />
          </FormField>
          <FormField label="Source Name" htmlFor="sourceName" required>
            <Input id="sourceName" value={form.sourceName} onChange={(e) => update("sourceName", e.target.value)} required />
          </FormField>
          <FormField label="Source URL" htmlFor="sourceUrl">
            <Input id="sourceUrl" value={form.sourceUrl} onChange={(e) => update("sourceUrl", e.target.value)} />
          </FormField>
          <FormField label="Priority" htmlFor="priority" required>
            <Select
              id="priority"
              value={form.priority}
              onChange={(e) => update("priority", e.target.value as LeadPriority)}
            >
              {Object.values(LeadPriority).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="status" required>
            <Select id="status" value={form.status} onChange={(e) => update("status", e.target.value as LeadStatus)}>
              {Object.values(LeadStatus).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Published At" htmlFor="publishedAt">
            <Input
              id="publishedAt"
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => update("publishedAt", e.target.value)}
            />
          </FormField>
        </FormGrid>

        <FormField label="Raw Text" htmlFor="rawTextSecond" required>
          <Textarea
            id="rawTextSecond"
            rows={8}
            value={form.rawText}
            onChange={(event) => update("rawText", event.target.value)}
          />
        </FormField>

        <FormField label="AI Summary" htmlFor="aiSummary">
          <Textarea
            id="aiSummary"
            rows={5}
            value={form.aiSummary}
            onChange={(event) => update("aiSummary", event.target.value)}
            placeholder="2-4 sentence lead summary for trader handover"
          />
        </FormField>
      </Card>

      {aiMessage ? <p className="text-sm text-sky-700">{aiMessage}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : form.id ? "Update Lead" : "Create Lead"}
      </Button>
    </form>
  );
}
