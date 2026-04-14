import { Sidebar } from "@/components/layout/sidebar";
import { TopHeader } from "@/components/layout/header";
import { getLocale } from "@/lib/i18n/get-locale";

export function AppShell({ children }: { children: React.ReactNode }) {
  const locale = getLocale();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar locale={locale} />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopHeader locale={locale} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
