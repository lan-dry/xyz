import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Verify email · Salanor Console",
};

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-root">{children}</div>;
}
