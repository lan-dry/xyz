import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Create account · Salanor Console",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-root">{children}</div>;
}
