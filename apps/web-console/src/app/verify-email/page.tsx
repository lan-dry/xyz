"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "@/lib/id-api";

import styles from "../login/login.module.css";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyFallback />}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Verifying…</p>
      </div>
    </div>
  );
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing verification token.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await idApi("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!cancelled) {
          router.replace("/aegis/traces");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Verification failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Confirm your email"
        description="We verify work emails before granting access to signed AI activity and org data."
      />
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Email verification</h2>
          {!error ? (
            <p className={styles.cardSub}>Confirming your link…</p>
          ) : (
            <>
              <p className={styles.error}>{error}</p>
              <p className={styles.footer}>
                <Link href="/login">Back to sign in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
