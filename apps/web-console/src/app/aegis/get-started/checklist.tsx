"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { consoleApi } from "@/lib/api";
import { ui } from "@/components/console/console-ui";

type Checklist = {
  create_api_key: boolean;
  send_first_event: boolean;
  see_sealed: boolean;
  approve_held: boolean;
  verify_bundle: boolean;
  invite_colleague: boolean;
};

const STEPS: Array<{ key: keyof Checklist; title: string; href: string; next: string }> = [
  {
    key: "create_api_key",
    title: "Create an API key",
    href: "/aegis/settings",
    next: "Create an ingest key so your systems can send events.",
  },
  {
    key: "send_first_event",
    title: "Send a first event",
    href: "/aegis/test-events",
    next: "Send a synthetic test event (sandbox) or use your Connector.",
  },
  {
    key: "see_sealed",
    title: "See it sealed",
    href: "/aegis/traces",
    next: "Open the case and confirm the receipt is sealed.",
  },
  {
    key: "approve_held",
    title: "Approve a held case",
    href: "/aegis/approvals",
    next: "Send a held scenario, then approve as a credit manager.",
  },
  {
    key: "verify_bundle",
    title: "Verify a bundle offline",
    href: "/verify",
    next: "Download an evidence bundle and drop it on Verify.",
  },
  {
    key: "invite_colleague",
    title: "Invite a colleague",
    href: "/aegis/settings",
    next: "Invite an auditor or approver by email.",
  },
];

export function SandboxChecklist() {
  const q = useQuery({
    queryKey: ["console", "sandbox", "status"],
    queryFn: () =>
      consoleApi<{
        is_sandbox: boolean;
        banner: string | null;
        sandbox_expires_at: string | null;
        checklist: Checklist;
      }>("/sandbox/status"),
  });

  if (!q.data?.is_sandbox && !q.data?.banner) return null;

  return (
    <section style={{ marginBottom: "1.5rem" }}>
      {q.data.banner ? (
        <p
          style={{
            padding: "0.75rem 1rem",
            background: "var(--console-surface-muted, #f4f4f5)",
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          {q.data.banner}
          {q.data.sandbox_expires_at
            ? ` · Expires ${q.data.sandbox_expires_at.slice(0, 10)}`
            : null}
        </p>
      ) : null}
      {q.data.is_sandbox ? (
        <>
          <h2 style={{ fontSize: "1.1rem", marginTop: "1rem" }}>Getting started</h2>
          <p className={ui.cardHint}>
            Each step ticks only when the server sees it done — not when you click.
          </p>
          <ol style={{ paddingLeft: "1.25rem" }}>
            {STEPS.map((s) => {
              const done = q.data.checklist[s.key];
              return (
                <li key={s.key} style={{ marginBottom: "0.5rem" }}>
                  <strong>{done ? "Done — " : ""}{s.title}</strong>
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
        </>
      ) : null}
    </section>
  );
}
