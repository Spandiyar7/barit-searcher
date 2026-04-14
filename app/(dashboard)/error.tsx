"use client";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-xl border bg-white p-8">
      <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-600">{error.message || "Could not load page data."}</p>
      <Button className="mt-4" onClick={() => reset()}>
        Try Again
      </Button>
    </div>
  );
}
