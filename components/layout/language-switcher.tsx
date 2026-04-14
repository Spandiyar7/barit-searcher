"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { getTranslator } from "@/lib/i18n/dictionaries";
import { LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils/cn";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = getTranslator(locale);

  const updateLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-2 py-1">
      <span className="text-xs font-medium text-slate-500">{t("header.language")}</span>
      <button
        type="button"
        onClick={() => updateLocale("en")}
        disabled={pending}
        className={cn(
          "rounded-md px-2 py-1 text-xs font-semibold transition",
          locale === "en" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => updateLocale("ru")}
        disabled={pending}
        className={cn(
          "rounded-md px-2 py-1 text-xs font-semibold transition",
          locale === "ru" ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
        )}
      >
        RU
      </button>
    </div>
  );
}
