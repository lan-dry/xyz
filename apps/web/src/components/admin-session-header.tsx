"use client";

import { signOut } from "next-auth/react";

export function AdminSessionHeader({ email }: { email: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-ink/80">
      <span className="truncate">{email}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded border border-black/15 px-3 py-1.5 text-ink transition hover:bg-black/5"
      >
        Sign out
      </button>
    </div>
  );
}
