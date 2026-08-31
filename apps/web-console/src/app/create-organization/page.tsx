"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PlatformAuthAside } from "@/components/auth/platform-auth-aside";
import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

import styles from "../login/login.module.css";

function slugFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "organization";
}

export default function CreateOrganizationPage() {
  return (
    <Suspense fallback={<CreateOrgFallback />}>
      <CreateOrganizationForm />
    </Suspense>
  );
}

function CreateOrgFallback() {
  return (
    <div className={styles.shell}>
      <div className={styles.formPanel}>
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
  );
}

function CreateOrganizationForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const meQuery = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const suggestedSlug = useMemo(() => slugFromName(companyName), [companyName]);

  useEffect(() => {
    if (!slugTouched && companyName) {
      setSlug(suggestedSlug);
    }
  }, [companyName, suggestedSlug, slugTouched]);

  useEffect(() => {
    if (meQuery.isError) {
      router.replace("/login?return=/create-organization");
      return;
    }
    if (meQuery.isSuccess && meQuery.data && !meQuery.data.needs_organization) {
      router.replace("/aegis");
    }
  }, [meQuery.isError, meQuery.isSuccess, meQuery.data, router]);

  if (meQuery.isPending) {
    return <CreateOrgFallback />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await idApi<MeResponse>("/orgs/create", {
        method: "POST",
        body: JSON.stringify({
          organization_name: companyName.trim(),
          organization_slug: slug.trim() || undefined,
        }),
      });
      router.replace("/aegis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setLoading(false);
    }
  }

  const email = meQuery.data?.account.email ?? "";

  return (
    <div className={styles.shell}>
      <PlatformAuthAside
        title="Start your organization"
        description="You no longer have access to a previous organization, or you never finished setup. Create a new company workspace to continue with Aegis."
      />
      <div className={styles.formPanel}>
        <div className={styles.card}>
          <h2>Create organization</h2>
          <p className={styles.cardSub}>
            Signed in as <strong>{email}</strong>. Name your company to open the console as admin.
          </p>
          <form onSubmit={onSubmit}>
            <label className={styles.field}>
              <span>Company name</span>
              <input
                className={styles.input}
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Insurance"
                required
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span>URL slug</span>
              <input
                className={styles.input}
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="acme-insurance"
                pattern="[a-z0-9-]+"
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button type="submit" className={styles.submit} disabled={loading || !companyName.trim()}>
              {loading ? "Creating…" : "Create organization"}
            </button>
          </form>
          <p className={styles.footer}>
            Have an invite?{" "}
            <a href="/login" className={styles.footerLink}>
              Sign in and open your invite link
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
