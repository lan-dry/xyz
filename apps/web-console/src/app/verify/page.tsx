"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  error?: string;
};

type LocalDemoResult = {
  label: string;
  ok: boolean;
  detail: string;
  amountUsd: number;
};

type TamperDemoResponse = {
  intact?: { ok: boolean; amount_usd: number; detail: string };
  tampered?: { ok: boolean; amount_usd: number; detail: string };
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
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResults, setDemoResults] = useState<LocalDemoResult[] | null>(null);

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
      setHttpError("Organization slug and event ID are required.");
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

  async function runTamperDemo() {
    setDemoLoading(true);
    setDemoResults(null);
    try {
      const res = await fetch("/api/verify/tamper-demo", { method: "POST" });
      const json = (await res.json()) as TamperDemoResponse;
      if (!res.ok || json.error) {
        setDemoResults([
          {
            label: "Demo error",
            ok: false,
            amountUsd: 0,
            detail: json.error ?? `Request failed (${res.status})`,
          },
        ]);
        return;
      }
      setDemoResults([
        {
          label: "Intact receipt",
          ok: Boolean(json.intact?.ok),
          amountUsd: json.intact?.amount_usd ?? 249,
          detail: json.intact?.detail ?? "",
        },
        {
          label: "Tampered receipt",
          ok: Boolean(json.tampered?.ok),
          amountUsd: json.tampered?.amount_usd ?? 250,
          detail: json.tampered?.detail ?? "",
        },
      ]);
    } catch (err) {
      setDemoResults([
        {
          label: "Demo error",
          ok: false,
          amountUsd: 0,
          detail: err instanceof Error ? err.message : "Could not run tamper demo",
        },
      ]);
    } finally {
      setDemoLoading(false);
    }
  }

  const verification = result?.verification;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Salanor Aegis</p>
        <h1>Public event verification</h1>
        <p className={styles.lead}>
          Confirm a sealed event is recorded in the witness tree and transparency
          log. No console login required. Paste an organization slug and event ID
          from a case receipt.
        </p>
      </header>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.fieldRow}>
          <label>
            <span>Organization slug</span>
            <input
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="northwind-payments"
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
            {verification.ok ? "Verification passed" : "Verification failed"}
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
            <CheckRow label="Witness Merkle inclusion" ok={verification.witness_ok} />
            <CheckRow
              label="Transparency log Merkle inclusion"
              ok={verification.transparency_ok}
            />
            <CheckRow label="Transparency leaf hash" ok={verification.leaf_ok} />
          </ul>
          {verification.errors.length > 0 ? (
            <pre className={styles.errors}>{verification.errors.join("\n")}</pre>
          ) : null}
        </section>
      ) : null}

      <section className={styles.demo}>
        <div className={styles.demoHeader}>
          <div>
            <h2>Try tamper sample</h2>
            <p>
              Offline Ed25519 check on a Northwind sample receipt. One card is
              intact; the other changes a single amount byte and must fail.
            </p>
          </div>
          <button
            type="button"
            className={styles.demoButton}
            onClick={() => void runTamperDemo()}
            disabled={demoLoading}
          >
            {demoLoading ? "Checking…" : "Run tamper demo"}
          </button>
        </div>
        <div className={styles.demoGrid}>
          <article className={styles.demoCard}>
            <h3>Intact</h3>
            <p className={styles.mono}>amount_usd: 249</p>
            <p className={styles.demoHint}>Signed payload as recorded.</p>
          </article>
          <article className={styles.demoCard}>
            <h3>Tampered</h3>
            <p className={styles.mono}>amount_usd: 250</p>
            <p className={styles.demoHint}>
              Same signature; amount edited after signing.
            </p>
          </article>
        </div>
        {demoResults ? (
          <ul className={styles.demoResults}>
            {demoResults.map((row) => (
              <li
                key={row.label}
                className={row.ok ? styles.verdictOk : styles.verdictFail}
              >
                <strong>{row.label}</strong>
                {row.amountUsd > 0 ? (
                  <span className={styles.mono}> · ${row.amountUsd}</span>
                ) : null}
                <div>{row.detail}</div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
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
