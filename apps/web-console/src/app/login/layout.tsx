import type { Metadata } from "next";

import "./auth.css";

export const metadata: Metadata = {
  title: "Sign in · Salanor Console",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-root">{children}</div>;
}
