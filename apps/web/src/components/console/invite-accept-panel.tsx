"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { consoleAegisPath } from "@/lib/app-paths";
import { formatDateTime } from "@/lib/format-datetime";

export function InviteAcceptPanel({
  token,
  inviteEmail,
  signedInEmail,
  orgName,
  role,
  expiresAtIso,
}: {
  token: string;
  inviteEmail: string;
  signedInEmail: string;
  orgName: string;
  role: string;
  expiresAtIso: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [pending, startTransition] = useTransition();
  const inviteMatchesSignedIn = inviteEmail.toLowerCase() === signedInEmail.toLowerCase();

  return (
    <section className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">Accept organization invite</h1>
      <p className="mt-3 text-sm text-ink/80">
        Organization: <span className="font-medium">{orgName}</span>
      </p>
      <p className="text-sm text-ink/80">
        Role: <span className="font-medium">{role}</span>
      </p>
      <p className="text-sm text-ink/80">
        Invite sent to: <span className="font-medium">{inviteEmail}</span>
      </p>
      <p className="text-sm text-ink/70">Expires: {formatDateTime(expiresAtIso)}</p>

      {inviteMatchesSignedIn ? null : (
        <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You are signed in as <span className="font-medium">{signedInEmail}</span>. Sign in as{" "}
          <span className="font-medium">{inviteEmail}</span> to accept this invite.
        </p>
      )}

      {error ? (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p>
      ) : null}

      {accepted ? (
        <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Invite accepted. Continue to{" "}
          <Link className="underline" href={consoleAegisPath("/members")}>
            console members
          </Link>
          .
        </div>
      ) : (
        <button
          type="button"
          disabled={pending || !inviteMatchesSignedIn}
          className="mt-6 rounded bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-60"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await fetch("/api/console/invites/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              });
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                setError(data.error ?? "Could not accept invite.");
                return;
              }
              setAccepted(true);
            });
          }}
        >
          Accept invite
        </button>
      )}
    </section>
  );
}
