import { cn } from "@/lib/utils/cn";

const variantStyles: Record<string, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-800",
  info: "bg-sky-100 text-sky-800"
};

export function Badge({
  children,
  variant = "default"
}: {
  children: React.ReactNode;
  variant?: keyof typeof variantStyles;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", variantStyles[variant])}>
      {children}
    </span>
  );
}
