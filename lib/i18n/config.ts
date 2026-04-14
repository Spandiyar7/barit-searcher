export type Locale = "en" | "ru";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE_NAME = "crm_locale";

export const normalizeLocale = (value?: string | null): Locale => {
  if (value === "ru") return "ru";
  return DEFAULT_LOCALE;
};
