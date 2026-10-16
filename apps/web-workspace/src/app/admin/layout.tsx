import "@/styles/stoa-admin-theme.css";

import { AdminShell } from "@/components/admin-shell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-stoa-admin>
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
