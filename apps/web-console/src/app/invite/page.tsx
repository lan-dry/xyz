"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PasswordField } from "@/components/auth/password-field";
import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { IdApiError, idApi } from "@/lib/id-api";
import type { InvitePreview, MeResponse } from "@/lib/types";

import styles from "../login/login.module.css";

type PreviewResponse = {
  invitation: InvitePreview;
  has_account: boolean;
};

export default function InvitePage() {
  return (
    <Suspense fallback={<InviteFallback />}>
      <InviteAcceptForm />
    </Suspense>
  );
}

function InviteFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading invitation…</p>
      </div>
    </div>
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
    return (
      <InviteLayout inv={null}>
        {invalidInvite("Missing invitation token.")}
      </InviteLayout>
    );
  }

  if (previewQuery.isPending) {
    return <InviteFallback />;
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
          <p className={styles.cardSub}>
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
              <span>Your name (optional)</span>
              <input
                className={styles.input}
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Chen"
              />
            </label>
            <PasswordField
              label="Password"
              fieldClassName={styles.field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
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
          <p className={styles.cardSub}>
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
          <p className={styles.cardSub}>
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
      <p className={styles.cardSub}>{message}</p>
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
    <div className={styles.shell}>
      <PlatformAuthAside
        title={inv ? `Join ${inv.organization_name}` : "Organization invite"}
        description="Aegis console access with signed provenance, scoped to your organization's ledger."
      />

      <div className={styles.formPanel}>
        <div className={styles.card}>
          {inv ? (
            <div className={styles.inviteMeta}>
              Invited as <strong>{inv.role}</strong>
              <br />
              Email <strong>{inv.email}</strong>
              <br />
              Expires {new Date(inv.expires_at).toLocaleDateString()}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
