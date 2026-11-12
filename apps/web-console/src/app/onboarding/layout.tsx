import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Set up organization · Salanor Console",
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-root">{children}</div>;
}
