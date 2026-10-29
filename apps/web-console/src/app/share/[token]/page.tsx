"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import styles from "../share.module.css";

type ShareReceiptResponse = {
  share: {
    share_id: string;
    expires_at: string;
    read_only: boolean;
    organization_name: string;
    organization_slug: string;
  };
  receipt: {
    event_id: string;
    trace_id: string;
    agent_id: string;
    action_kind: string;
    policy_decision: string;
    tool_name: string | null;
    event_hash: string;
    prev_event_hash: string | null;
    chain_valid: boolean;
    emitted_at: string;
    amount_usd: number | null;
    reason: string | null;
    approver: string | null;
    decision: string;
  };
  verification: {
    status: "valid" | "pending" | "unavailable";
    detail: string;
  };
  error?: string;
};

function outcomeLabel(decision: string): string {
  const d = decision.toLowerCase();
  if (d === "allow") return "Allowed";
  if (d === "deny") return "Stopped";
  if (d === "allow_with_obligation" || d === "pending") return "Ask a person";
  if (d === "approved") return "Approved";
  if (d === "rejected") return "Declined";
  return decision;
}

export default function ShareReceiptPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params.token ?? ""));

  const query = useQuery({
    queryKey: ["share-receipt", token],
    queryFn: async () => {
      const res = await fetch(
        `/api/public/share/receipt/${encodeURIComponent(token)}`,
      );
      const json = (await res.json()) as ShareReceiptResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      return json;
    },
    enabled: Boolean(token),
    retry: false,
  });

  const data = query.data;
  const verifyClass =
    data?.verification.status === "valid"
      ? styles.badge
      : data?.verification.status === "pending"
        ? styles.badgeWarn
        : styles.badgeFail;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Salanor Aegis · Shared receipt</p>
        <h1 className={styles.title}>Sealed receipt</h1>
        <p className={styles.lead}>
          Read-only view of a signed governance step. No Console login required.
          This link expires.
        </p>

        {query.isPending ? (
          <p className={styles.meta} role="status">
            Loading receipt…
          </p>
        ) : null}

        {query.error ? (
          <div className={styles.alert} role="alert">
            <strong>Link unavailable.</strong>{" "}
            {query.error instanceof Error
              ? query.error.message
              : "Share link invalid or expired."}
          </div>
        ) : null}

        {data ? (
          <>
            <p className={styles.meta}>
              {data.share.organization_name} · expires{" "}
              {new Date(data.share.expires_at).toLocaleString()}
            </p>

            <section className={styles.card} aria-labelledby="action-heading">
              <h2 id="action-heading" className={styles.cardTitle}>
                Action
              </h2>
              <dl className={styles.dl}>
                <div>
                  <dt className={styles.dt}>What</dt>
                  <dd className={styles.dd}>
                    {data.receipt.tool_name ?? data.receipt.action_kind}
                  </dd>
                </div>
                {data.receipt.amount_usd != null ? (
                  <div>
                    <dt className={styles.dt}>Amount</dt>
                    <dd className={styles.dd}>
                      ${data.receipt.amount_usd.toLocaleString()} USD
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className={styles.dt}>When</dt>
                  <dd className={styles.dd}>
                    {new Date(data.receipt.emitted_at).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={styles.card} aria-labelledby="policy-heading">
              <h2 id="policy-heading" className={styles.cardTitle}>
                Policy
              </h2>
              <dl className={styles.dl}>
                <div>
                  <dt className={styles.dt}>Outcome</dt>
                  <dd className={styles.dd}>
                    <span className={styles.badge}>
                      {outcomeLabel(data.receipt.policy_decision)}
                    </span>
                  </dd>
                </div>
                {data.receipt.reason ? (
                  <div>
                    <dt className={styles.dt}>Why</dt>
                    <dd className={styles.dd}>{data.receipt.reason}</dd>
                  </div>
                ) : null}
                {data.receipt.approver ? (
                  <div>
                    <dt className={styles.dt}>Approver</dt>
                    <dd className={styles.dd}>{data.receipt.approver}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section className={styles.card} aria-labelledby="proof-heading">
              <h2 id="proof-heading" className={styles.cardTitle}>
                Proof
              </h2>
              <dl className={styles.dl}>
                <div>
                  <dt className={styles.dt}>Chain</dt>
                  <dd className={styles.dd}>
                    {data.receipt.chain_valid ? "Intact" : "Broken"}
                  </dd>
                </div>
                <div>
                  <dt className={styles.dt}>Event hash</dt>
                  <dd className={`${styles.dd} ${styles.mono}`}>
                    {data.receipt.event_hash}
                  </dd>
                </div>
                <div>
                  <dt className={styles.dt}>Public verification</dt>
                  <dd className={styles.dd}>
                    <span className={verifyClass}>
                      {data.verification.status}
                    </span>
                    <span style={{ display: "block", marginTop: "0.35rem" }}>
                      {data.verification.detail}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={styles.dt}>Case ID</dt>
                  <dd className={`${styles.dd} ${styles.mono}`}>
                    {data.receipt.trace_id}
                  </dd>
                </div>
              </dl>
            </section>

            <p className={styles.footer}>
              Access is logged. Do not forward after the expiry time. Org{" "}
              <span className={styles.mono}>{data.share.organization_slug}</span>
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
