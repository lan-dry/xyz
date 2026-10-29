"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { IdApiError, idApi } from "@/lib/id-api";
import type { InvitePreview, MeResponse } from "@/lib/id-types";
import { roleLabel } from "@/lib/roles";

import styles from "../login/login.module.css";

type PreviewResponse = {
  invitation: InvitePreview;
  has_account: boolean;
};

export default function InvitePage() {
  return (
    <Suspense fallback={<p className={styles.loading}>Loading invitation…</p>}>
      <InviteAcceptForm />
    </Suspense>
  );
}

function InviteAcceptForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");

  const previewQuery = useQuery({
    queryKey: ["id", "invite-preview", token],
    queryFn: () =>
      idApi<PreviewResponse>(
        `/invitations/preview?token=${encodeURIComponent(token)}`,
      ),
    enabled: Boolean(token),
    retry: false,
  });

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () =>
      idApi<MeResponse>("/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.replace("/");
    },
    onError: (err: Error) => setError(mapInviteError(err)),
  });

  const signupAccept = useMutation({
    mutationFn: () =>
      idApi<MeResponse>("/invitations/signup-accept", {
        method: "POST",
        body: JSON.stringify({
          token,
          display_name: displayName.trim() || undefined,
          password,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
      router.replace("/");
    },
    onError: (err: Error) => {
      setError(mapInviteError(err));
      if (err instanceof IdApiError && err.code === "account_exists") {
        void previewQuery.refetch();
      }
    },
  });

  const inv = previewQuery.data?.invitation;
  const hasAccount = previewQuery.data?.has_account ?? false;
  const signedIn = Boolean(meQuery.data?.user);
  const emailMatches =
    signedIn &&
    inv &&
    meQuery.data?.account.email.toLowerCase() === inv.email.toLowerCase();

  if (!token) {
    return (
      <InviteShell inv={null}>
        <h2>Invitation unavailable</h2>
        <p className={styles.sub}>This link is incomplete.</p>
        <Link href="/login" className={styles.submitBtn}>
          Sign in
        </Link>
      </InviteShell>
    );
  }

  if (previewQuery.isPending) {
    return <p className={styles.loading}>Loading invitation…</p>;
  }

  if (previewQuery.isError || !inv) {
    return (
      <InviteShell inv={null}>
        <h2>Invitation unavailable</h2>
        <p className={styles.sub}>
          This invite may have expired or already been used.
        </p>
        <Link href="/login" className={styles.submitBtn}>
          Sign in
        </Link>
      </InviteShell>
    );
  }

  return (
    <InviteShell inv={inv}>
      {!hasAccount ? (
        <>
          <h2 style={{ marginTop: 0 }}>Create your account</h2>
          <p className={styles.sub}>
            Join <strong>{inv.organization_name}</strong> as{" "}
            <strong>{roleLabel(inv.role)}</strong>.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              signupAccept.mutate();
            }}
          >
            <label className={styles.field}>
              Your name (optional)
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            <p className={styles.hint} style={{ marginTop: "-0.5rem" }}>
              At least 10 characters.
            </p>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={signupAccept.isPending}
            >
              {signupAccept.isPending ? "Creating account…" : "Join"}
            </button>
          </form>
          <p className={styles.hint}>
            Already have an account?{" "}
            <Link
              href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}`}
            >
              Sign in
            </Link>
          </p>
        </>
      ) : !signedIn ? (
        <>
          <h2 style={{ marginTop: 0 }}>Sign in to accept</h2>
          <p className={styles.sub}>
            Sign in as <strong>{inv.email}</strong> to join{" "}
            {inv.organization_name}.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Link
            href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}&email=${encodeURIComponent(inv.email)}`}
            className={styles.submitBtn}
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Sign in to accept
          </Link>
        </>
      ) : !emailMatches ? (
        <>
          <h2 style={{ marginTop: 0 }}>Wrong account</h2>
          <p className={styles.error}>
            Signed in as {meQuery.data?.account.email}, but this invite is for{" "}
            {inv.email}.
          </p>
          <Link
            href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}&email=${encodeURIComponent(inv.email)}`}
            className={styles.submitBtn}
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Sign in as {inv.email}
          </Link>
        </>
      ) : (
        <>
          <h2 style={{ marginTop: 0 }}>Join organization</h2>
          <p className={styles.sub}>
            Accept to access Workspace for <strong>{inv.organization_name}</strong>.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="button"
            className={styles.submitBtn}
            disabled={accept.isPending}
            onClick={() => {
              setError(null);
              accept.mutate();
            }}
          >
            {accept.isPending ? "Joining…" : `Join ${inv.organization_name}`}
          </button>
        </>
      )}
    </InviteShell>
  );
}

function mapInviteError(err: Error): string {
  if (err instanceof IdApiError && err.code === "account_exists") {
    return "An account already exists for this email. Sign in instead.";
  }
  return err.message || "Something went wrong.";
}

function InviteShell({
  inv,
  children,
}: {
  inv: InvitePreview | null;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.panel} style={{ width: "min(480px, 100%)" }}>
        <h1>Workspace</h1>
        <p className={styles.sub}>
          {inv
            ? `Invitation to ${inv.organization_name}`
            : "Organization invitation"}
        </p>
        {inv ? (
          <p className={styles.hint} style={{ marginBottom: "1rem" }}>
            Role: {roleLabel(inv.role)} · {inv.email} · expires{" "}
            {new Date(inv.expires_at).toLocaleDateString()}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
