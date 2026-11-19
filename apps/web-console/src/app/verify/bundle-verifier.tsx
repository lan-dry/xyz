"use client";

import { useRef, useState } from "react";

import styles from "./verify.module.css";

export type BundleCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "pending" | "info";
  detail?: string;
};

export type BundleFinding = { code: string; message: string; record?: number | string };

export type BundleResult = {
  ok: boolean;
  error?: string;
  message: string;
  checks: BundleCheck[];
  findings: BundleFinding[];
  receipts?: number;
  case_id?: string | null;
  witness?: "included" | "pending" | "none";
  /** "Record intact: signed and unchanged since <time>" (about the record). */
  record_line?: string | null;
  /** "Source of the data: G1. Signed by X ..." (about where the data came from). */
  source_line?: string | null;
};

const MAX_BYTES = 8 * 1024 * 1024;

/** The seven checks a reader should always see, in this order. */
const CHECK_ORDER = [
  "signature",
  "chain",
  "sequence",
  "policy_hash",
  "approvals",
  "witness",
  "trusted_time",
] as const;

const STATUS_WORD: Record<BundleCheck["status"], string> = {
  pass: "Pass",
  fail: "Fail",
  pending: "Pending",
  info: "Note",
};

/** Put the standard checks first, in a fixed order; keep any other checks after them. */
export function orderChecks(checks: BundleCheck[]): BundleCheck[] {
  const rank = (id: string) => {
    const i = (CHECK_ORDER as readonly string[]).indexOf(id);
    return i === -1 ? CHECK_ORDER.length : i;
  };
  return [...checks].sort((a, b) => rank(a.id) - rank(b.id));
}

/** POST a bundle (object or raw text) to the public stateless verifier. */
export async function postBundle(body: string | object): Promise<BundleResult> {
  const res = await fetch("/api/public/evidence-bundle/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as BundleResult | null;
  if (!json) throw new Error("The verifier gave no answer. Try again.");
  return json;
}

export function CheckLine({ check }: { check: BundleCheck }) {
  const cls =
    check.status === "pass"
      ? styles.checkOk
      : check.status === "fail"
        ? styles.checkFail
        : check.status === "pending"
          ? styles.checkPending
          : styles.checkInfo;
  const icon =
    check.status === "pass" ? "✓" : check.status === "fail" ? "✗" : check.status === "pending" ? "…" : "i";
  return (
    <li className={cls}>
      <span className={styles.checkIcon} aria-hidden>
        {icon}
      </span>
      <span>
        {check.label}
        <strong className={styles.checkWord}> · {STATUS_WORD[check.status]}</strong>
        {check.detail ? <span className={styles.checkDetail}>{check.detail}</span> : null}
      </span>
    </li>
  );
}

/** Verdict, the seven checks, findings and any pending-witness note for one result. */
export function BundleResultView({
  result,
  hideVerdict = false,
}: {
  result: BundleResult;
  hideVerdict?: boolean;
}) {
  const failedChecks = result.checks.some((c) => c.status === "fail");
  const pendingWitness = result.checks.find((c) => c.id === "witness" && c.status === "pending");
  const passed = Boolean(result.ok) && !failedChecks;
  return (
    <div aria-live="polite">
      {hideVerdict ? null : (
        <div className={passed ? styles.bundleVerdictPass : styles.bundleVerdictFail}>
          {passed
            ? (result.record_line ?? `Record intact. ${result.message}`)
            : `Record check failed. ${result.message}`}
        </div>
      )}
      {/* A second, separate answer: where the data came from. Never green. */}
      {result.source_line ? (
        <div className={styles.sourceLine}>{result.source_line}</div>
      ) : null}
      {result.checks.length > 0 ? (
        <ul className={styles.checks}>
          {orderChecks(result.checks).map((c) => (
            <CheckLine key={`${c.id}-${c.label}`} check={c} />
          ))}
        </ul>
      ) : null}
      {result.findings.length > 0 ? (
        <ul className={styles.findings}>
          {result.findings.map((f, i) => (
            <li key={`${f.code}-${i}`}>{f.message}</li>
          ))}
        </ul>
      ) : null}
      {pendingWitness ? (
        <p className={styles.pendingNote}>
          <strong>Witness confirmation is pending.</strong>{" "}
          {pendingWitness.detail ??
            "The Salanor witness checkpoint has not confirmed these receipts yet. The signature checks above are not affected."}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Drop (or choose) a downloaded evidence bundle and check it. The check runs on
 * the server (POST /api/public/evidence-bundle/verify); nothing is stored.
 */
export function BundleVerifier() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<BundleResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function verifyFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setProblem(null);
    if (file.size > MAX_BYTES) {
      setProblem("That file is too large to be an evidence bundle.");
      return;
    }
    setBusy(true);
    try {
      const json = await postBundle(await file.text());
      if (json.error === "not_a_bundle" && json.checks.length === 0) {
        setProblem(json.message);
        return;
      }
      setResult(json);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not reach the verifier.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void verifyFile(file);
  }

  return (
    <section className={styles.bundle} aria-labelledby="bundle-verify-heading">
      <h2 id="bundle-verify-heading">Check an evidence bundle</h2>
      <p>
        Drop the evidence bundle file you downloaded from a case. We re-check every
        signature, the chain between receipts, and that nothing was removed or edited.
      </p>
      <div
        className={`${styles.dropzone} ${active ? styles.dropzoneActive : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setActive(true);
        }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
      >
        <strong>{busy ? "Checking…" : "Drop an evidence bundle here"}</strong>
        <span>{fileName && !busy ? fileName : "or click to choose a .json file"}</span>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void verifyFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {problem ? (
        <p className={styles.error} role="alert" style={{ marginTop: "0.75rem" }}>
          {problem}
        </p>
      ) : null}

      {result ? <BundleResultView result={result} /> : null}
    </section>
  );
}

type SampleBundles = {
  organization_slug: string;
  case_id: string | null;
  valid: object;
  tampered: object;
  tamper: { summary: string; currency: string | null; original: number; altered: number };
};

type SampleRow = {
  key: "valid" | "tampered";
  title: string;
  hint: string;
  result: BundleResult | null;
  problem: string | null;
};

const TAMPER_PLAIN = "The amount in this record no longer matches its signature.";

function downloadJson(name: string, data: object) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Demo Bank sample: fetch two real bundles (one valid, one with an amount digit
 * changed after signing) and check both. Outside an `is_demo` tenant the API
 * withholds samples; we show that as a plain note instead of an error.
 */
export function DemoBundleTry() {
  const [samples, setSamples] = useState<SampleBundles | null>(null);
  const [rows, setRows] = useState<SampleRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  async function load(): Promise<SampleBundles | null> {
    const res = await fetch("/api/public/demo/sample-bundles");
    const json = (await res.json().catch(() => null)) as
      | (SampleBundles & { message?: string })
      | null;
    if (!res.ok || !json || !("valid" in json)) {
      setUnavailable(
        (json as { message?: string } | null)?.message ??
          (res.status === 403 || res.status === 404
            ? "Sample bundles are only available in the demo environment."
            : `Could not load the sample bundles (${res.status}).`),
      );
      return null;
    }
    return json;
  }

  async function checkBoth() {
    setBusy(true);
    setUnavailable(null);
    setRows(null);
    try {
      const data = samples ?? (await load());
      if (!data) return;
      setSamples(data);
      const [valid, tampered] = await Promise.all([
        postBundle(data.valid).then(
          (r) => ({ r, p: null as string | null }),
          (e: unknown) => ({ r: null, p: e instanceof Error ? e.message : "Check failed." }),
        ),
        postBundle(data.tampered).then(
          (r) => ({ r, p: null as string | null }),
          (e: unknown) => ({ r: null, p: e instanceof Error ? e.message : "Check failed." }),
        ),
      ]);
      setRows([
        {
          key: "valid",
          title: "Record as recorded",
          hint: "The bundle exactly as Demo Bank signed it.",
          result: valid.r,
          problem: valid.p,
        },
        {
          key: "tampered",
          title: "Record with one amount digit changed",
          hint: data.tamper.summary,
          result: tampered.r,
          problem: tampered.p,
        },
      ]);
    } catch (err) {
      setUnavailable(err instanceof Error ? err.message : "Could not reach the verifier.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.demo} aria-labelledby="demo-bundle-heading">
      <div className={styles.demoHeader}>
        <div>
          <h2 id="demo-bundle-heading">Try with a Demo Bank bundle</h2>
          <p>
            We take a real, signed Demo Bank case. One copy is untouched. In the other,
            one digit of the amount is changed after signing. Check both to see the
            difference.
          </p>
        </div>
        <button
          type="button"
          className={styles.demoButton}
          onClick={() => void checkBoth()}
          disabled={busy}
        >
          {busy ? "Checking…" : "Check both"}
        </button>
      </div>

      {unavailable ? (
        <p className={styles.error} role="alert">
          {unavailable}
        </p>
      ) : null}

      {samples ? (
        <p className={styles.demoHint}>
          Case {samples.case_id ?? "(unnamed)"} ·{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => downloadJson("demo-bank-valid-bundle.json", samples.valid)}
          >
            Download the valid bundle
          </button>{" "}
          ·{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => downloadJson("demo-bank-tampered-bundle.json", samples.tampered)}
          >
            Download the changed bundle
          </button>{" "}
          to try the drop zone above.
        </p>
      ) : null}

      {rows ? (
        <ul className={styles.demoResults}>
          {rows.map((row) => {
            const failed =
              !row.result || !row.result.ok || row.result.checks.some((c) => c.status === "fail");
            return (
              <li key={row.key} className={styles.demoCard}>
                <h3>{row.title}</h3>
                <p className={styles.demoHint}>{row.hint}</p>
                {row.problem ? (
                  <p className={styles.error} role="alert">
                    {row.problem}
                  </p>
                ) : null}
                {row.result ? (
                  <>
                    <div className={failed ? styles.verdictFail : styles.verdictOk}>
                      {failed
                        ? row.key === "tampered"
                          ? TAMPER_PLAIN
                          : "Record check failed."
                        : "Record intact. Every record check passed."}
                    </div>
                    <BundleResultView result={row.result} hideVerdict />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
