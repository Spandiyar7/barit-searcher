"use client";

import { useEffect } from "react";

const RELOAD_KEY = "crm_chunk_reload_ts";
const RELOAD_COOLDOWN_MS = 60_000;

const isChunkLoadMessage = (message: string) =>
  /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|dynamically imported module/i.test(
    message
  );

const maybeReload = () => {
  try {
    const now = Date.now();
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    if (lastReload > 0 && now - lastReload < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    window.location.reload();
  } catch {
    window.location.reload();
  }
};

export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || "";
      if (isChunkLoadMessage(message)) {
        maybeReload();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string } | undefined;
      const message =
        typeof reason === "string"
          ? reason
          : reason && typeof reason === "object" && typeof reason.message === "string"
            ? reason.message
            : "";

      if (isChunkLoadMessage(message)) {
        maybeReload();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}

