import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Create organization · Salanor Console",
};

export default function CreateOrganizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="auth-root">{children}</div>;
}
