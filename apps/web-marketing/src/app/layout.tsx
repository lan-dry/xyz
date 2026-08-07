import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import { MarketingJsonLd } from "@/components/seo/marketing-json-ld";
import { SITE_ORIGIN } from "@/lib/site-origin";

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

const titleDefault = "Salanor · Provenance for agent systems";
const description =
  "Aegis by Salanor: provenance and liability coverage for AI agents. Signed APS-1 events, policy enforcement, and compliance exports.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: titleDefault,
    template: "%s · Salanor",
  },
  description,
  applicationName: "Salanor",
  keywords: [
    "Salanor",
    "Salanor Aegis",
    "Aegis",
    "APS-1",
    "AI agent provenance",
    "agent governance",
    "AI audit trail",
  ],
  authors: [{ name: "Salanor Ltd", url: SITE_ORIGIN }],
  creator: "Salanor Ltd",
  publisher: "Salanor Ltd",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_ORIGIN,
    siteName: "Salanor",
    title: titleDefault,
    description,
    images: [
      {
        url: "/salanor-logo.png",
        alt: "Salanor",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: titleDefault,
    description,
    images: ["/salanor-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "SBliCTZw8RXqy7ty06k-bAy-LqCKpDRaLdiJuAMPbIY",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <MarketingJsonLd />
        <GoogleAnalytics />
        <MarketingChrome>{children}</MarketingChrome>
      </body>
    </html>
  );
}
