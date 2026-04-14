import { format } from "date-fns";

export const fmtDate = (value?: string | Date | null) => {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "dd MMM yyyy");
};

export const fmtNumber = (value?: number | string | null, maxFractionDigits = 2) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(numeric);
};

export const fmtMoney = (
  value?: number | string | null,
  currency = "USD",
  maxFractionDigits = 2
) => {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: maxFractionDigits
  }).format(numeric);
};

export const toTitleCase = (value?: string | null) => {
  if (!value) return "-";
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};
