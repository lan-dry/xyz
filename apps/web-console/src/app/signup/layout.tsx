import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "../login/auth.css";

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
  title: "Create account · Salanor Console",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`auth-root ${plexSans.variable} ${plexMono.variable}`}>{children}</div>
  );
}
