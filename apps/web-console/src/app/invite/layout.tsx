import type { Metadata } from "next";

import "../login/auth.css";

export const metadata: Metadata = {
  title: "Accept invitation · Salanor Console",
};

export default function InviteRouteLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-root">{children}</div>;
}
