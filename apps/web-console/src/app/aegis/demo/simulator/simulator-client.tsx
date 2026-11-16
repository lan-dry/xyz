"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  OutcomeChip,
  PageHeader,
  ui,
} from "@/components/console/console-ui";
import { idApi } from "@/lib/id-api";
import { formatApprover, formatRoleLabel } from "@/lib/describe-decision";
import { formatRwf } from "@/lib/format-display";
import type { MeResponse } from "@/lib/types";

type Expect = "allow" | "hold" | "stop";

type Story = {
  id: string;
  title: string;
  expect: Expect;
  /** One plain sentence on the expected outcome. */
  expect_detail?: string;
  blurb: string;
  resolver: string | null;
  attributes: Record<string, unknown>;
  setup_kind?: string | null;
};

type Actor = {
  email: string;
  display_name: string | null;
  bank_role: string | null;
  note?: string | null;
};

type StoriesResponse = { stories: Story[]; actors: Actor[] };

type StoryResult = {
  ok: boolean;
  story_id: string;
  expected: Expect;
  expect_detail?: string;
  case_id: string;
  trace_id: string | null;
  outcome: string;
  plain_summary: string | null;
  matched_rules: Array<{ rule_id: string }>;
  approval_id: string | null;
  required_roles: string[];
  resolver: string | null;
  steps?: string[];
  decided_without_aegis?: boolean;
  sealed: boolean;
};

const EXPECT_CHIP: Record<Expect, { chip: string; kind: "allow" | "ask_person" | "stop" }> = {
  allow: { chip: "Expect: allowed", kind: "allow" },
  hold: { chip: "Expect: held", kind: "ask_person" },
  stop: { chip: "Expect: stopped", kind: "stop" },
};

const EXPECT_WORD: Record<Expect, string> = {
  allow: "allowed",
  hold: "held",
  stop: "stopped",
};

async function simulatorFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/demo/simulator/${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(body.message ?? body.error ?? res.statusText);
  }
  return body as T;
}

function chipFor(outcome: string): { chip: string; kind: "allow" | "ask_person" | "stop" | "neutral" } {
  if (outcome === "allow") return { chip: "Allowed", kind: "allow" };
  if (outcome === "hold") return { chip: "Held for approval", kind: "ask_person" };
  if (outcome === "stop") return { chip: "Stopped", kind: "stop" };
  return { chip: outcome, kind: "neutral" };
}

function attributePreview(attrs: Record<string, unknown>): string {
  const parts: string[] = [];
  const amount = typeof attrs.amount === "number" ? attrs.amount : null;
  const currency = typeof attrs.currency === "string" ? attrs.currency : "RWF";
  if (amount != null) parts.push(formatRwf(amount, currency));
  for (const key of ["applicant_name", "branch", "loan_purpose", "purpose"]) {
    const v = attrs[key];
    if (typeof v === "string") parts.push(v);
  }
  return parts.join(" · ");
}

/** The other loopback host name: separate cookies, so a second person can sign in there. */
function otherHost(host: string): string | null {
  const [name, port] = host.split(":");
  const suffix = port ? `:${port}` : "";
  if (name === "localhost") return `127.0.0.1${suffix}`;
  if (name === "127.0.0.1") return `localhost${suffix}`;
  return null;
}

export function SimulatorClient() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<StoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const [protocol, setProtocol] = useState("http:");

  useEffect(() => {
    setHost(window.location.host);
    setProtocol(window.location.protocol);
  }, []);

  const stories = useQuery({
    queryKey: ["demo", "simulator", "stories"],
    queryFn: () => simulatorFetch<StoriesResponse>("stories"),
    retry: false,
  });
  const me = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  const actors = stories.data?.actors ?? [];

  /** "Jean Mutabazi · Credit Manager" for a demo email (the email itself stays out of the way). */
  function person(email: string | null | undefined): string | null {
    if (!email) return null;
    const a = actors.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!a) return null;
    return (
      formatApprover(a.display_name, a.bank_role) ??
      a.display_name ??
      formatRoleLabel(a.bank_role)
    );
  }

  async function run(storyId: string) {
    setRunning(storyId);
    setError(null);
    setResult(null);
    setResetDone(false);
    try {
      const out = await simulatorFetch<StoryResult>("story", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId }),
      });
      setResult(out);
      void queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the story.");
    } finally {
      setRunning(null);
    }
  }

  async function doReset() {
    // The API enforces the typed confirmation too; never send it unless it matches.
    if (resetText !== "RESET") return;
    setResetting(true);
    setError(null);
    try {
      await simulatorFetch<{ ok: boolean }>("reset", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      });
      setResult(null);
      setResetDone(true);
      setConfirmReset(false);
      setResetText("");
      void queryClient.invalidateQueries({ queryKey: ["console"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  const user = me.data?.user;
  const signedInAs = person(user?.email);
  const alt = host ? otherHost(host) : null;

  return (
    <ConsolePage>
      <PageHeader
        title="Bank simulator"
        subtitle="Synthetic data only. Each button sends a real event through the same governed intake a bank system would use. Amounts are in RWF."
      />

      <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
        <h2 className={ui.panelTitle}>Who is deciding</h2>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
          {user ? (
            <>
              You are signed in as{" "}
              <strong>{signedInAs ?? user.display_name ?? user.email}</strong>
              {signedInAs ? null : <> ({user.role.replace(/_/g, " ")})</>}.
            </>
          ) : (
            "Checking who you are signed in as…"
          )}
        </p>
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
          A browser keeps one session per host name, so signing in as someone else in the
          same tab signs the previous person out.
        </p>
        <div
          style={{
            margin: "0.5rem 0",
            padding: "0.65rem 0.85rem",
            border: "1px solid var(--console-border)",
            borderRadius: "var(--console-radius)",
            fontSize: "0.8125rem",
            background: "var(--console-surface-hover)",
          }}
          data-two-hosts
        >
          <strong>Two people in one browser: use two host names.</strong>{" "}
          <span className="mono">localhost</span> and <span className="mono">127.0.0.1</span>{" "}
          are separate sessions (cookies are kept per host name). Sign in as one person on{" "}
          <span className="mono">http://localhost:3000</span> and as another on{" "}
          <span className="mono">http://127.0.0.1:3000</span>, side by side. For three or more
          roles, add a private window or a second browser profile. Not yet tested in a
          browser: confirm once before the room.
          {host ? (
            <>
              {" "}
              This tab is on <span className="mono">{host}</span>
              {alt ? (
                <>
                  . Second person:{" "}
                  <a
                    className={ui.tableLink}
                    href={`${protocol}//${alt}/aegis/demo/simulator`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open {alt}
                  </a>
                  .
                </>
              ) : (
                <>.</>
              )}
            </>
          ) : null}
        </div>
        {actors.length ? (
          <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8125rem" }}>
            {actors.map((a) => (
              <li key={a.email}>
                <strong>{person(a.email) ?? a.display_name ?? a.email}</strong>
                {a.note ? <> · {a.note}</> : null}
                <span style={{ color: "var(--console-fg-muted)" }}>
                  {" "}
                  · sign in as <span className="mono">{a.email}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {stories.isLoading ? <LoadingBlock /> : null}
      {stories.error ? <ErrorAlert message={(stories.error as Error).message} /> : null}
      {error ? <ErrorAlert message={error} /> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        {(stories.data?.stories ?? []).map((s) => (
          <section key={s.id} className={`${ui.card} ${ui.cardPad}`}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              <h2 className={ui.panelTitle} style={{ margin: 0 }}>
                {s.title}
              </h2>
              <OutcomeChip chip={EXPECT_CHIP[s.expect].chip} kind={EXPECT_CHIP[s.expect].kind} />
            </div>
            <p style={{ margin: "0.5rem 0", fontSize: "0.875rem", lineHeight: 1.5 }}>{s.blurb}</p>
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              {attributePreview(s.attributes)}
            </p>
            {s.expect_detail ? (
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem" }}>
                <strong>Expected:</strong> {s.expect_detail}
              </p>
            ) : null}
            {s.resolver ? (
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
                Decides: {person(s.resolver) ?? s.resolver}
              </p>
            ) : null}
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={running !== null}
              onClick={() => void run(s.id)}
            >
              {running === s.id ? "Sending…" : "Send this case"}
            </button>
          </section>
        ))}
      </div>

      {result ? (
        <section
          className={`${ui.card} ${ui.cardPad}`}
          style={{ marginBottom: "1.25rem" }}
          aria-live="polite"
        >
          <h2 className={ui.panelTitle}>Result</h2>
          <p style={{ margin: "0 0 0.5rem" }}>
            <OutcomeChip {...chipFor(result.outcome)} />
            <span className="mono" style={{ marginLeft: "0.65rem", fontSize: "0.8125rem" }}>
              {result.case_id}
            </span>
          </p>
          {result.plain_summary ? (
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.9375rem" }}>{result.plain_summary}</p>
          ) : null}
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem" }}>
            <strong>Expected:</strong> {EXPECT_WORD[result.expected]}.{" "}
            {result.outcome === result.expected ? (
              <span style={{ color: "var(--console-success)" }}>Matches.</span>
            ) : (
              <span style={{ color: "var(--console-warning)" }}>
                Got {result.outcome}. Check the active rules (re-run demo:up to refresh the
                policy pack).
              </span>
            )}
            {result.expect_detail ? <> {result.expect_detail}</> : null}
          </p>
          {result.steps && result.steps.length > 0 ? (
            <ol style={{ margin: "0 0 0.5rem", paddingLeft: "1.2rem", fontSize: "0.8125rem" }}>
              {result.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
          {result.decided_without_aegis ? (
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              The receipt is marked <strong>decided without Aegis</strong>.
            </p>
          ) : null}
          {result.outcome === "hold" || result.outcome === "stop" ? (
            <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              Waiting for{" "}
              {result.required_roles.length > 0
                ? result.required_roles.map((r) => formatRoleLabel(r) ?? r).join(" and ")
                : "an approver"}
              {result.resolver && person(result.resolver) ? (
                <> (sign in as {person(result.resolver)})</>
              ) : null}
              .
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {result.trace_id ? (
              <Link
                href={`/aegis/traces/${encodeURIComponent(result.trace_id)}`}
                className={`${ui.btn} ${ui.btnSecondary}`}
              >
                Open the case
              </Link>
            ) : null}
            {result.approval_id ? (
              <Link
                href={`/aegis/approvals?focus=${encodeURIComponent(result.approval_id)}`}
                className={`${ui.btn} ${ui.btnSecondary}`}
              >
                Open approval
              </Link>
            ) : null}
            <Link href="/aegis/live" className={`${ui.btn} ${ui.btnGhost}`}>
              Live feed
            </Link>
          </div>
        </section>
      ) : null}

      <section className={`${ui.card} ${ui.cardPad}`}>
        <h2 className={ui.panelTitle}>Reset</h2>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
          Clears the demo bank&apos;s cases, receipts and approvals so you can rehearse again.
          Rules and demo users are kept. Only works in the demo environment. You must type
          RESET to confirm.
        </p>
        {resetDone ? (
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--console-success)" }}>
            Demo data cleared.
          </p>
        ) : null}
        {confirmReset ? (
          <form
            style={{ display: "grid", gap: "0.5rem", maxWidth: "24rem" }}
            onSubmit={(e) => {
              e.preventDefault();
              void doReset();
            }}
          >
            <label className={ui.field}>
              Type RESET to confirm
              <input
                className={ui.input}
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className={ui.formRow}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => {
                  setConfirmReset(false);
                  setResetText("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`${ui.btn} ${ui.btnDanger}`}
                disabled={resetText !== "RESET" || resetting}
              >
                {resetting ? "Clearing…" : "Clear demo data"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={() => setConfirmReset(true)}
          >
            Reset demo data
          </button>
        )}
      </section>
    </ConsolePage>
  );
}
