"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ConvertToDealButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onConvert = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leads/${leadId}/convert`, {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Conversion failed");
      }

      const payload = (await response.json()) as { data: { id: string } };
      router.push(`/deals/${payload.data.id}`);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not convert lead to deal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" variant="secondary" disabled={loading} onClick={onConvert}>
      {loading ? "Converting..." : "Convert to Deal"}
    </Button>
  );
}
