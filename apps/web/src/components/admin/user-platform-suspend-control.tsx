"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserPlatformSuspendControl({
  userId,
  email,
  suspended,
}: {
  userId: string;
  email: string;
  suspended: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleSuspend() {
    const nextSuspend = !suspended;
    const verb = nextSuspend ? "suspend" : "unsuspend";
    const confirmed = window.confirm(
      nextSuspend
        ? `Suspend platform access for ${email}? They will be blocked from admin and console sign-in.`
        : `Restore platform access for ${email}?`,
    );
    if (!confirmed) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/platform-suspend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspend: nextSuspend }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to ${verb}`);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void toggleSuspend()}
        className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
          suspended
            ? "border-[var(--admin-border)] text-[var(--admin-fg)] hover:bg-[var(--admin-surface-hover)]"
            : "border-red-300/60 text-red-700 hover:bg-red-50"
        }`.trim()}
      >
        {pending ? "…" : suspended ? "Unsuspend" : "Suspend"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
