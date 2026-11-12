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
    agent_name?: string;
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
    inclusion_status?: "ok" | "pending" | "unavailable";
    inclusion_detail?: string | null;
  };
  story?: {
    what_happened: string;
    description?: string | null;
    data_seen: string | null;
    policy_decision: string;
    policy_reason: string | null;
    anomaly: string | null;
    status: string;
    fields?: string[];
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
  const chainOk = Boolean(data?.receipt.chain_valid);
  const fullyVerified = data?.verification.status === "valid" &&
    (data.verification.inclusion_status === "ok" ||
      data.verification.inclusion_status == null);
  // Intact seal reads as finished even while public witness inclusion catches up.
  const showVerified = chainOk || data?.verification.status === "valid";
  const inclusionPending =
    showVerified &&
    (data?.verification.inclusion_status === "pending" ||
      (data?.verification.status === "pending" && chainOk));
  const verifyClass = showVerified
    ? styles.badge
    : data?.verification.status === "pending"
      ? styles.badgeWarn
      : styles.badgeFail;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Salanor Aegis · Shared receipt</p>
        <h1 className={styles.title}>
          {data?.story?.what_happened ?? "Shared receipt"}
        </h1>
        <p className={styles.lead}>
          {data?.story?.description?.trim() ||
            "Read-only record of what this agent did. No console login required."}
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

            <p className={styles.statusRow}>
              <span className={`${styles.badge} ${verifyClass}`}>
                {showVerified
                  ? "Verified"
                  : data.verification.status === "pending"
                    ? "Verification pending"
                    : "Verification unavailable"}
              </span>
              <span className={styles.metaInline}>
                {showVerified
                  ? fullyVerified
                    ? data.verification.detail
                    : "Signature chain is intact."
                  : data.verification.detail}
              </span>
            </p>

            {data.story?.anomaly ? (
              <div className={styles.attention} role="status">
                <strong>Needs attention</strong>
                <p>{data.story.anomaly}</p>
              </div>
            ) : null}

            <section className={styles.card} aria-labelledby="happened-heading">
              <h2 id="happened-heading" className={styles.cardTitle}>
                What happened
              </h2>
              <p className={styles.prose}>
                {data.story?.description?.trim() ||
                  data.story?.what_happened ||
                  data.receipt.tool_name ||
                  data.receipt.action_kind}
              </p>
              <p className={styles.metaInline}>
                {data.receipt.agent_name?.trim() || data.receipt.agent_id}
                {" · "}
                {new Date(data.receipt.emitted_at).toLocaleString()}
                {data.story?.status ? ` · ${data.story.status}` : ""}
              </p>
            </section>

            <section className={styles.card} aria-labelledby="data-heading">
              <h2 id="data-heading" className={styles.cardTitle}>
                What data was seen
              </h2>
              {data.story?.fields && data.story.fields.length > 0 ? (
                <ul className={styles.fieldList}>
                  {data.story.fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.prose}>No fields were recorded on this case.</p>
              )}
              {data.receipt.amount_usd != null ? (
                <p className={styles.metaInline}>
                  Amount ${data.receipt.amount_usd.toLocaleString()} USD
                </p>
              ) : null}
            </section>

            <section className={styles.card} aria-labelledby="policy-heading">
              <h2 id="policy-heading" className={styles.cardTitle}>
                Policy decision
              </h2>
              <p className={styles.prose}>
                <span className={styles.badge}>
                  {data.story?.policy_decision ??
                    outcomeLabel(data.receipt.policy_decision)}
                </span>
              </p>
              {data.story?.policy_reason || data.receipt.reason ? (
                <p className={styles.prose}>
                  {data.story?.policy_reason ?? data.receipt.reason}
                </p>
              ) : null}
              {data.receipt.approver ? (
                <p className={styles.metaInline}>Approver {data.receipt.approver}</p>
              ) : null}
            </section>

            <details className={styles.technical}>
              <summary>Technical details</summary>
              <dl className={styles.dl}>
                <div>
                  <dt className={styles.dt}>Chain</dt>
                  <dd className={styles.dd}>
                    {data.receipt.chain_valid ? "Intact" : "Broken"}
                  </dd>
                </div>
                <div>
                  <dt className={styles.dt}>Public inclusion</dt>
                  <dd className={styles.dd}>
                    {data.verification.inclusion_status === "ok"
                      ? "Witness and transparency verified"
                      : inclusionPending
                        ? data.verification.inclusion_detail ||
                          "Witness inclusion is still processing"
                        : data.verification.inclusion_detail ||
                          data.verification.detail}
                  </dd>
                </div>
                <div>
                  <dt className={styles.dt}>Event hash</dt>
                  <dd className={`${styles.dd} ${styles.mono}`}>
                    {data.receipt.event_hash}
                  </dd>
                </div>
                {data.receipt.prev_event_hash ? (
                  <div>
                    <dt className={styles.dt}>Previous hash</dt>
                    <dd className={`${styles.dd} ${styles.mono}`}>
                      {data.receipt.prev_event_hash}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className={styles.dt}>Case ID</dt>
                  <dd className={`${styles.dd} ${styles.mono}`}>
                    {data.receipt.trace_id}
                  </dd>
                </div>
              </dl>
            </details>

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
