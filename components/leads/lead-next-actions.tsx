"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type LeadContext = {
  title: string;
  rawText: string;
  product: string;
  leadType: string;
  volume: string | null;
  unit: string | null;
  price: string | null;
  currency: string | null;
  incoterms: string | null;
  originCountry: string | null;
  destinationCountry: string | null;
};

export function LeadNextActions({ context }: { context: LeadContext }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [meta, setMeta] = useState<string>("");

  const generate = async () => {
    setLoading(true);
    setError(null);
    setMeta("");

    try {
      const response = await fetch("/api/ai/suggest-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context)
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Failed to generate suggestions");
      }

      const payload = (await response.json()) as {
        data: { actions: string[]; ai: { provider: string; configured: boolean } };
      };

      setActions(payload.data.actions || []);
      setMeta(
        payload.data.ai.configured
          ? `Suggestions by ${payload.data.ai.provider}`
          : "Fallback suggestions (no AI key configured)"
      );
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Failed to generate suggestions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" onClick={generate} disabled={loading}>
        {loading ? "Generating..." : "Suggest Next Actions"}
      </Button>
      {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {actions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {actions.map((action, index) => (
            <li key={`${action}-${index}`}>{action}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
