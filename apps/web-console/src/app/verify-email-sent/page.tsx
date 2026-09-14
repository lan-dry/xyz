"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "@/lib/id-api";

import styles from "../login/login.module.css";

export default function VerifyEmailSentPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailSentContent />
    </Suspense>
  );
}

function VerifyEmailSentContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resend() {
    if (!email) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await idApi<{ ok: boolean; message?: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(
        res.message ??
          "If your account is pending verification, we sent a new link to that address.",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Almost there"
        description="Verify your work email to access the Aegis console, policies, and signed event ledger."
      />
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Check your email</h2>
          <p className={styles.cardSub}>
            We sent a verification link to{" "}
            <strong>{email || "your address"}</strong>. Open it on this device, then sign in.
          </p>
          <p className={styles.cardSub}>
            Did not receive it? Check spam or request another link below.
          </p>
          {message ? <p className={styles.cardSub}>{message}</p> : null}
          <button
            type="button"
            className={styles.submit}
            disabled={!email || loading}
            onClick={() => void resend()}
          >
            {loading ? "Sending…" : "Resend verification email"}
          </button>
          <p className={styles.footer}>
            <Link href="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
