"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, consoleDownload } from "@/lib/api";
import { ErrorAlert, ui } from "@/components/console/console-ui";
import { ResetSandboxPanel } from "@/components/console/reset-sandbox";
import {
  checklistComplete,
  useSandboxStatus,
  type SandboxChecklistFlags,
} from "@/lib/tenant-copy";

const STEPS: Array<{
  key: keyof SandboxChecklistFlags;
  title: string;
  href: string;
  next: string;
}> = [
  {
    key: "create_api_key",
    title: "Create an API key",
    href: "/aegis/keys",
    next: "Create an ingest key for your systems.",
  },
  {
    key: "send_first_event",
    title: "Send a first event",
    href: "/aegis/test-events",
    next: "Use Test sender or your API.",
  },
  {
    key: "see_sealed",
    title: "See it sealed",
    href: "/aegis/live",
    next: "Open a case and check the receipt.",
  },
  {
    key: "approve_held",
    title: "Approve an exception",
    href: "/aegis/approvals",
    next: "Send a held scenario, then approve it.",
  },
  {
    key: "verify_bundle",
    title: "Verify a bundle offline",
    href: "/verify",
    next: "Download a bundle below, then verify it offline.",
  },
  {
    key: "invite_colleague",
    title: "Invite a colleague",
    href: "/aegis/settings/members",
    next: "Invite an auditor or approver by email.",
  },
];

/** @deprecated Prefer ResetSandboxPanel — kept as a thin alias for older imports. */
export function ResetSandboxButton() {
  return <ResetSandboxPanel compact />;
}

export function SandboxSamples() {
  const queryClient = useQueryClient();
  const feed = useMutation({
    mutationFn: () => consoleDownload("/sandbox/sample-feed", "sample-feed.jsonl"),
  });
  const bundle = useMutation({
    mutationFn: () =>
      consoleDownload("/sandbox/sample-bundle", "sample-evidence-bundle.json"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "sandbox", "status"] });
    },
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnSecondary}`}
        disabled={feed.isPending}
        onClick={() => feed.mutate()}
      >
        Download sample feed
      </button>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnSecondary}`}
        disabled={bundle.isPending}
        onClick={() => bundle.mutate()}
      >
        Download sample evidence bundle
      </button>
      {feed.error ? (
        <ErrorAlert
          message={feed.error instanceof ApiError ? feed.error.message : "Could not download the sample feed."}
        />
      ) : null}
      {bundle.error ? (
        <ErrorAlert
          message={
            bundle.error instanceof ApiError
              ? bundle.error.message
              : "Could not download a sample bundle. Send a test event first."
          }
        />
      ) : null}
    </div>
  );
}

function ChecklistBody({ checklist }: { checklist: SandboxChecklistFlags }) {
  return (
    <>
      <ol style={{ paddingLeft: "1.25rem", margin: "0.75rem 0 0" }}>
        {STEPS.map((s) => {
          const done = checklist[s.key];
          return (
            <li key={s.key} style={{ marginBottom: "0.5rem" }}>
              <span aria-hidden>{done ? "✓ " : "○ "}</span>
              <strong>{s.title}</strong>
              {!done ? (
                <>
                  {" "}
                  — {s.next}{" "}
                  <Link href={s.href} className={ui.tableLink}>
                    Open
                  </Link>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      <SandboxSamples />
      <div style={{ marginTop: "0.75rem" }}>
        <ResetSandboxPanel compact />
      </div>
    </>
  );
}

export function SandboxChecklist() {
  const q = useSandboxStatus();
  const status = q.data;
  const [expanded, setExpanded] = useState(false);

  if (!status?.is_sandbox) return null;

  const done = checklistComplete(status.checklist);
  const doneCount = STEPS.filter((s) => status.checklist[s.key]).length;

  if (done && !expanded) {
    return (
      <section
        style={{
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          border: "1px solid var(--border, #d5ddd8)",
          borderRadius: 10,
          background: "var(--surface, #f7f9f8)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            Getting started complete — all {STEPS.length} steps done.
          </p>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnGhost}`}
            onClick={() => setExpanded(true)}
          >
            Show again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      style={{
        marginBottom: "1.5rem",
        padding: "1rem 1.1rem",
        border: "1px solid var(--border, #d5ddd8)",
        borderRadius: 10,
        background: "var(--surface, #f7f9f8)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Getting started</h2>
        <span className={ui.cardHint} style={{ margin: 0 }}>
          {doneCount} of {STEPS.length} done
          {done ? (
            <>
              {" · "}
              <button
                type="button"
                className={ui.tableLink}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
                onClick={() => setExpanded(false)}
              >
                Collapse
              </button>
            </>
          ) : null}
        </span>
      </div>
      <p className={ui.cardHint} style={{ marginTop: "0.35rem" }}>
        Steps tick themselves when each action is really done.
      </p>
      <ChecklistBody checklist={status.checklist} />
    </section>
  );
}
