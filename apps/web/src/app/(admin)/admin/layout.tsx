import type { Metadata } from "next";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/admin/require-admin";

export const metadata: Metadata = {
  title: "Salanor Admin",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email, role } = await requireAdminSession();
  return (
    <AdminShell
      email={email}
      role={role}
      signOutControl={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="text-sm text-[var(--admin-fg)] transition-colors duration-150 hover:text-[var(--admin-fg-muted)]"
          >
            Log out
          </button>
        </form>
      }
    >
      {children}
    </AdminShell>
  );
}
