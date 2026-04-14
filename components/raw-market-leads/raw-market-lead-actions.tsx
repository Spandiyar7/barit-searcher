"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type RawMarketLeadActionsProps = {
  id: string;
  status: "PENDING_REVIEW" | "IMPORTED" | "REJECTED";
  labels: {
    promote: string;
    reject: string;
    duplicate: string;
    promoting: string;
    rejecting: string;
    markingDuplicate: string;
  };
};

type ActionName = "promote" | "reject" | "duplicate";

export function RawMarketLeadActions({ id, status, labels }: RawMarketLeadActionsProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<ActionName | null>(null);

  const runAction = async (action: ActionName) => {
    try {
      setLoadingAction(action);
      const response = await fetch(`/api/raw-market-leads/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "promote" ? JSON.stringify({ saveCompany: true }) : undefined
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Action failed");
      }

      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Action failed");
    } finally {
      setLoadingAction(null);
    }
  };

  const disabled = status === "IMPORTED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-3 text-xs"
        onClick={() => void runAction("promote")}
        disabled={disabled || loadingAction !== null}
      >
        {loadingAction === "promote" ? labels.promoting : labels.promote}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-8 px-3 text-xs"
        onClick={() => void runAction("duplicate")}
        disabled={loadingAction !== null}
      >
        {loadingAction === "duplicate" ? labels.markingDuplicate : labels.duplicate}
      </Button>
      <Button
        type="button"
        variant="danger"
        className="h-8 px-3 text-xs"
        onClick={() => void runAction("reject")}
        disabled={loadingAction !== null}
      >
        {loadingAction === "reject" ? labels.rejecting : labels.reject}
      </Button>
    </div>
  );
}
