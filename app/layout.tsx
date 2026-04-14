import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/get-locale";
import { ChunkLoadRecovery } from "@/components/layout/chunk-load-recovery";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commodity Trading CRM",
  description: "AI-powered commodity trading CRM MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();

  return (
    <html lang={locale}>
      <body>
        <ChunkLoadRecovery />
        {children}
      </body>
    </html>
  );
}
