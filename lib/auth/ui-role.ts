import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type UiRole = "operator" | "admin";

export const UI_ROLE_COOKIE = "crm_ui_role";

const normalizeUiRole = (value: string | null | undefined): UiRole =>
  (value || "").trim().toLowerCase() === "admin" ? "admin" : "operator";

export const getUiRole = (): UiRole => {
  const cookieRole = cookies().get(UI_ROLE_COOKIE)?.value;
  const envRole = process.env.CRM_UI_ROLE || process.env.CRM_DEFAULT_ROLE;
  return normalizeUiRole(cookieRole || envRole);
};

export const isAdminUiRole = () => getUiRole() === "admin";

export const requireAdminUiAccess = () => {
  if (!isAdminUiRole()) {
    redirect("/lead-database");
  }
};

