import type { Metadata } from "next";

import { ConsoleThemeScript } from "@/components/console/console-theme-script";
import { plexMono, plexSans } from "@/lib/fonts";

import { Providers } from "./providers";
import "./globals.css";
import "../styles/console.css";

export const metadata: Metadata = {
  title: {
    default: "Salanor Console",
    template: "%s · Salanor Console",
  },
  description: "Aegis operator console: traces, approvals, policies, compliance exports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ConsoleThemeScript />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
