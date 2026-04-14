"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActivityType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField, FormGrid } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Props = {
  companyId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
};

export function ActivityForm({ companyId, contactId, leadId, dealId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<ActivityType>("NOTE");
  const [note, setNote] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!note.trim()) {
      setError("Note is required");
      return;
    }

    try {
      setLoading(true);
      const payload = {
        companyId: companyId ?? null,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        dealId: dealId ?? null,
        type,
        note,
        nextActionDate: nextActionDate ? new Date(nextActionDate).toISOString() : null
      };

      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not add activity");
      }

      setNote("");
      setNextActionDate("");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not add activity");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-slate-50 p-4">
      <FormGrid className="grid-cols-1 md:grid-cols-2">
        <FormField label="Type" htmlFor="activityType" required>
          <Select id="activityType" value={type} onChange={(event) => setType(event.target.value as ActivityType)}>
            {Object.values(ActivityType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Next Action Date" htmlFor="nextActionDate">
          <Input
            id="nextActionDate"
            type="date"
            value={nextActionDate}
            onChange={(event) => setNextActionDate(event.target.value)}
          />
        </FormField>
      </FormGrid>
      <FormField label="Note" htmlFor="activityNote" required>
        <Textarea
          id="activityNote"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Call update, negotiation note, task, or follow-up details"
          rows={4}
        />
      </FormField>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <Button type="submit" disabled={loading}>
        {loading ? "Adding..." : "Add Activity"}
      </Button>
    </form>
  );
}
