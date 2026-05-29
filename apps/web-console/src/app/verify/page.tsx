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

  useEffect(() => {
    const qOrg = searchParams.get("org");
    const qEvent = searchParams.get("event");
    if (qOrg && qEvent) {
      void runVerify(qOrg, qEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial URL only
  }, []);

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

  const verification = result?.verification;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Salanor Aegis</p>
        <h1>Public event verification</h1>
        <p className={styles.lead}>
          Independently confirm that an APS event is included in the witness Merkle tree
          and the organization transparency log — no console login required.
        </p>
      </header>

      <form className={styles.form} onSubmit={onSubmit}>
        <label>
          <span>Organization slug</span>
          <input
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="dev-org"
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
        <button type="submit" disabled={loading}>
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>

      {httpError ? <p className={styles.error}>{httpError}</p> : null}

      {result && verification ? (
        <section className={styles.result}>
          <div
            className={
              verification.ok ? styles.verdictOk : styles.verdictFail
            }
          >
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
          <p className={styles.footnote}>
            CLI:{" "}
            <code className={styles.mono}>
              pnpm verifier:public -- --org {result.organization_slug} --event{" "}
              {result.event_id}
            </code>
          </p>
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
