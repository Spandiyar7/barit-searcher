"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type FindContactButtonProps = {
  leadId: string;
  idleLabel: string;
  loadingLabel: string;
  successLabel: string;
  errorLabel: string;
};

export function FindContactButton({
  leadId,
  idleLabel,
  loadingLabel,
  successLabel,
  errorLabel
}: FindContactButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const run = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leads/${leadId}/find-contact`, {
        method: "POST"
      });

      const payload = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || errorLabel);
      }

      alert(successLabel);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : errorLabel);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="secondary" onClick={run} disabled={loading}>
      {loading ? loadingLabel : idleLabel}
    </Button>
  );
}

