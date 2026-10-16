import type { Metadata } from "next";

import { AdminThemeScript } from "@/components/admin-theme-script";
import { AuthGate } from "@/components/auth-gate";
import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Stoa",
  description: "Stoa workspace by Salanor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AdminThemeScript />
        <QueryProvider>
          <AuthGate>{children}</AuthGate>
        </QueryProvider>
      </body>
    </html>
  );
}
