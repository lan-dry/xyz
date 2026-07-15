"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { SalanorLogo } from "@/components/salanor-logo";
import { IdApiError, idApi } from "@/lib/id-api";
import type { InvitePreview, MeResponse } from "@/lib/types";

import styles from "./invite.module.css";

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3001";

type PreviewResponse = {
  invitation: InvitePreview;
  has_account: boolean;
};

export default function InvitePage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading invitation…</p>}>
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
      router.replace("/aegis");
    },
    onError: (err: Error) => {
      setError(mapInviteError(err));
    },
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
      router.replace("/aegis");
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
    return <InviteLayout inv={null}>{invalidInvite("Missing invitation token.")}</InviteLayout>;
  }

  if (previewQuery.isPending) {
    return <InviteLayout inv={null}>Loading invitation…</InviteLayout>;
  }

  if (previewQuery.isError || !inv) {
    return (
      <InviteLayout inv={null}>
        {invalidInvite("This invite may have expired or already been used.")}
      </InviteLayout>
    );
  }

  return (
    <InviteLayout inv={inv}>
      {!hasAccount ? (
        <>
          <h2>Create your account</h2>
          <p className={styles.sub}>
            No Salanor account exists for <strong>{inv.email}</strong> yet. Set a
            password to join as <strong>{inv.role}</strong>.
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
                className={styles.input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Chen"
              />
            </label>
            <label className={styles.field}>
              Password
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button
              type="submit"
              className={styles.submit}
              disabled={signupAccept.isPending}
            >
              {signupAccept.isPending ? "Creating account…" : "Create account & join"}
            </button>
          </form>
          <p className={styles.footer}>
            Already have an account?{" "}
            <Link href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}`}>
              Sign in with {inv.email}
            </Link>
          </p>
        </>
      ) : !signedIn ? (
        <>
          <h2>Sign in to accept</h2>
          <p className={styles.sub}>
            An account already exists for <strong>{inv.email}</strong>. Sign in with
            that email to join <strong>{inv.organization_name}</strong>.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <Link
            href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}&email=${encodeURIComponent(inv.email)}`}
            className={styles.submit}
          >
            Sign in to accept
          </Link>
          <p className={styles.footer}>
            Wrong email on your account? Ask your admin to send a new invite to the
            correct address.
          </p>
        </>
      ) : !emailMatches ? (
        <>
          <h2>Wrong account</h2>
          <p className={styles.error}>
            You&apos;re signed in as <strong>{meQuery.data?.account.email}</strong>, but
            this invite is for <strong>{inv.email}</strong>.
          </p>
          <Link
            href={`/login?return=${encodeURIComponent(`/invite?token=${token}`)}&email=${encodeURIComponent(inv.email)}`}
            className={styles.submit}
          >
            Sign in as {inv.email}
          </Link>
        </>
      ) : (
        <>
          <h2>Ready to join</h2>
          <p className={styles.sub}>
            Signed in as <strong>{inv.email}</strong>. Accept to access{" "}
            <strong>{inv.organization_name}</strong> as <strong>{inv.role}</strong>.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="button"
            className={styles.submit}
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
    </InviteLayout>
  );
}

function mapInviteError(err: Error): string {
  const code = err instanceof IdApiError ? err.code : undefined;
  if (code === "account_exists") {
    return "An account already exists for this email. Sign in below instead of creating a new one.";
  }
  if (code === "email_mismatch") {
    return "Sign in with the email address that received this invitation.";
  }
  return err.message || "Something went wrong. Try again.";
}

function invalidInvite(message: string) {
  return (
    <>
      <h2>Invitation unavailable</h2>
      <p className={styles.sub}>{message}</p>
      <Link href="/login" className={styles.submit}>
        Go to sign in
      </Link>
    </>
  );
}

function InviteLayout({
  inv,
  children,
}: {
  inv: InvitePreview | null;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell} data-console-shell>
      <aside className={styles.brand}>
        <a href={MARKETING_URL} className={styles.logo}>
          <SalanorLogo size={32} showWordmark />
        </a>
        <h1>
          {inv ? `Join ${inv.organization_name}` : "Organization invite"}
        </h1>
        <p>
          Aegis console access with litigation-ready provenance — scoped to your
          organization&apos;s ledger.
        </p>
        {inv ? (
          <div className={styles.meta}>
            <div style={{ marginBottom: "0.75rem" }}>
              <AegisMark />
            </div>
            <p style={{ margin: 0 }}>
              Invited as <strong>{inv.role}</strong>
              <br />
              Email <strong>{inv.email}</strong>
              <br />
              Expires {new Date(inv.expires_at).toLocaleDateString()}
            </p>
          </div>
        ) : null}
      </aside>
      <div className={styles.panel}>
        <div className={styles.card}>{children}</div>
      </div>
    </div>
  );
}
