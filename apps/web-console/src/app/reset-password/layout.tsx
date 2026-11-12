import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Choose new password · Salanor Console",
};

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="auth-root">{children}</div>;
}
