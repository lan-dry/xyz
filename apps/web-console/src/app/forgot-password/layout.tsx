import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Reset password · Salanor Console",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="auth-root">{children}</div>;
}
