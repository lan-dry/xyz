"use client";

import { Moon, Sun } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { idApi } from "@/lib/id-api";
import {
  resolveConsoleTheme,
  toggleConsoleTheme,
  type ConsoleTheme,
} from "@/lib/console-theme";
import type { CaseProvenance, MeResponse } from "@/lib/types";

import { BundleVerifier, DemoBundleTry } from "./bundle-verifier";
import styles from "./verify.module.css";

type Verification = {
  ok: boolean;
  witness_ok: boolean;
  transparency_ok: boolean;
  leaf_ok: boolean;
  errors: string[];
};

type VerifyResponse = {
  organization_id: string;
  organization_slug: string;
  event_id: string;
  event_hash: string;
  verification?: Verification;
  provenance?: CaseProvenance | null;
  error?: string;
};

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className={ok ? styles.checkOk : styles.checkFail}>
      <span className={styles.checkIcon}>{ok ? "✓" : "✗"}</span>
      {label}
    </li>
  );
}

function VerifyForm() {
  const searchParams = useSearchParams();
  const [org, setOrg] = useState(searchParams.get("org") ?? "");
  const [eventId, setEventId] = useState(searchParams.get("event") ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ConsoleTheme>("light");
  const orgTouched = useRef(Boolean(searchParams.get("org")));

  useEffect(() => {
    setTheme(resolveConsoleTheme());
  }, []);

  // Default the organization to the signed-in one. Anonymous visitors just see an empty box.
  const me = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
  const currentSlug = me.data?.organization?.slug ?? "";
  useEffect(() => {
    if (currentSlug && !orgTouched.current) setOrg(currentSlug);
  }, [currentSlug]);

  useEffect(() => {
    const qOrg = searchParams.get("org");
    const qEvent = searchParams.get("event");
    if (qOrg && qEvent) {
      void runVerify(qOrg, qEvent);
    }
  }, [searchParams]);

  async function runVerify(slug: string, evt: string) {
    setLoading(true);
    setHttpError(null);
    setResult(null);
    const slugTrim = slug.trim();
    const evtTrim = evt.trim();
    if (!slugTrim || !evtTrim) {
      setHttpError("Enter the organization and the event ID.");
      setLoading(false);
      return;
    }

    try {
      const url = `/api/public/orgs/${encodeURIComponent(slugTrim)}/verify/${encodeURIComponent(evtTrim)}?verify=1`;
      const res = await fetch(url);
      const json = (await res.json()) as VerifyResponse;
      if (!res.ok) {
        setHttpError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult(json);
      const next = new URL(window.location.href);
      next.searchParams.set("org", slugTrim);
      next.searchParams.set("event", evtTrim);
      window.history.replaceState(null, "", next.toString());
    } catch (err) {
      setHttpError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runVerify(org, eventId);
  }

  const verification = result?.verification;

  return (
    <div className={styles.page}>
      <div className={styles.themeBar}>
        <button
          type="button"
          className={styles.themeToggle}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(toggleConsoleTheme())}
        >
          {theme === "dark" ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Salanor Aegis</p>
        <h1>Verify a record</h1>
        <p className={styles.lead}>
          Check that a record from Aegis is genuine and has not been changed since it
          was sealed. No login needed. Drop an evidence bundle below, or enter the
          organization and event ID printed on a case receipt.
        </p>
        <section className={styles.lead} style={{ marginTop: "0.75rem" }} aria-labelledby="proves-heading">
          <h2 id="proves-heading" style={{ fontSize: "1rem", margin: "0 0 0.35rem" }}>
            What Aegis proves and what it does not
          </h2>
          <p style={{ margin: 0 }}>
            Aegis proves when a record was made and that it has not changed since.
            It does not check that the data inside is accurate. A grade (G0-G3)
            says who vouched for the data and how, not whether the content is right.
          </p>
        </section>
      </header>

      <BundleVerifier />

      <DemoBundleTry />

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.fieldRow}>
          <label>
            <span>Organization</span>
            <input
              value={org}
              onChange={(e) => {
                orgTouched.current = true;
                setOrg(e.target.value);
              }}
              placeholder="Your organization"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Event ID</span>
            <input
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              placeholder="evt_…"
              className={styles.mono}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button type="submit" disabled={loading}>
            {loading ? "Verifying…" : "Verify event"}
          </button>
        </div>
      </form>

      {httpError ? <p className={styles.error}>{httpError}</p> : null}

      {result && verification ? (
        <section className={styles.result}>
          <div className={verification.ok ? styles.verdictOk : styles.verdictFail}>
            {verification.ok
              ? (result.provenance?.record_line ??
                "Record intact: signed and unchanged since it was sealed")
              : "Record check failed: this record does not match its seal"}
          </div>
          <div className={styles.sourceLine}>
            {result.provenance?.source_line ??
              "Source of the data: not labelled. Aegis does not check that the data is accurate."}
          </div>
          <dl className={styles.meta}>
            <div>
              <dt>Organization</dt>
              <dd className={styles.mono}>{result.organization_slug}</dd>
            </div>
            <div>
              <dt>Event</dt>
              <dd className={styles.mono}>{result.event_id}</dd>
            </div>
            <div>
              <dt>Event hash</dt>
              <dd className={styles.mono}>{result.event_hash}</dd>
            </div>
          </dl>
          <ul className={styles.checks}>
            <CheckRow label="Salanor witness checkpoint (signed)" ok={verification.witness_ok} />
            <CheckRow
              label="Recorded in the public log"
              ok={verification.transparency_ok}
            />
            <CheckRow label="Log entry matches this record" ok={verification.leaf_ok} />
          </ul>
          {verification.errors.length > 0 ? (
            <pre className={styles.errors}>{verification.errors.join("\n")}</pre>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}

export default function PublicVerifyPage() {
  return (
    <Suspense fallback={<div className={styles.page}>Loading…</div>}>
      <VerifyForm />
    </Suspense>
  );
}
