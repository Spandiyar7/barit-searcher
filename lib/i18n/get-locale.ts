import { cookies } from "next/headers";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "./config";

export const getLocale = () => {
  const cookieStore = cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
};
