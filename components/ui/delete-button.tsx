"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type DeleteButtonProps = {
  endpoint: string;
  redirectTo?: string;
  label?: string;
};

export function DeleteButton({ endpoint, redirectTo, label = "Delete" }: DeleteButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onDelete = async () => {
    const confirmed = window.confirm("Are you sure you want to delete this record?");
    if (!confirmed) return;

    try {
      setLoading(true);
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Delete failed");
      }

      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="danger" onClick={onDelete} disabled={loading}>
      {loading ? "Deleting..." : label}
    </Button>
  );
}
