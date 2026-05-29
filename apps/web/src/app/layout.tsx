import type { Metadata } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

const siteDescription =
  "The trust layer for systems that act — verifiable decisions for autonomous and AI-driven systems.";

function resolveMetadataBase(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";
  if (process.env.NODE_ENV !== "production") {
    try {
      const host = new URL(raw).hostname;
      if (host === "salanor.com" || host.endsWith(".salanor.com")) {
        return new URL("http://localhost:3000");
      }
    } catch {
      /* use raw */
    }
  }
  return new URL(raw);
}

const metadataBase = resolveMetadataBase();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Salanor",
    template: "%s · Salanor",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: metadataBase,
    siteName: "Salanor",
    title: "Salanor",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "Salanor",
    description: siteDescription,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable}`}>{children}</body>
    </html>
  );
}
