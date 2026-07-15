import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { MarketingChrome } from "@/components/marketing/marketing-chrome";

import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Salanor — Trust infrastructure for agentic AI",
    template: "%s · Salanor",
  },
  description:
    "Aegis, by Salanor — the provenance and liability layer for AI agents. Signed APS-1 events, policy enforcement, and compliance exports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
