"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  BackLink,
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { buildEventProvenance } from "@/lib/event-provenance";
import type { EventDetail } from "@/lib/types";

type VerifyResult = {
  verification: {
    ok: boolean;
    chain_ok: boolean;
    inclusion_ok: boolean;
    errors: string[];
    root_hash?: string;
  };
  inclusion_proof: {
    root_id: string;
    root_hash: string;
    leaf_index: number;
  } | null;
};

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = decodeURIComponent(params.eventId);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["console", "event", eventId],
    queryFn: () =>
      consoleApi<{ event: EventDetail }>(
        `/events/${encodeURIComponent(eventId)}`,
      ),
  });

  const verify = useMutation({
    mutationFn: () =>
      consoleApi<VerifyResult>(
        `/events/${encodeURIComponent(eventId)}/verify`,
      ),
    onSuccess: (result) => setVerifyResult(result),
  });

  const e = data?.event;
  const provenance = e
    ? buildEventProvenance({
        tool_name: e.tool_name,
        action_kind: e.action_kind,
        policy_decision: e.policy_decision,
        payload: e.payload_enriched ?? e.payload,
      })
    : null;

  return (
    <ConsolePage>
      {e ? (
        <BackLink href={`/aegis/traces/${encodeURIComponent(e.trace_id)}`}>
          ← Trace {e.trace_id}
        </BackLink>
      ) : null}
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Event not found or failed to load." /> : null}
      {e ? (
        <>
          <PageHeader
            title={e.event_id}
            subtitle={
              <>
                <StatusBadge status={e.policy_decision} /> · {e.action_kind}
                {e.tool_name ? ` · ${e.tool_name}` : ""}
              </>
            }
            actions={
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => verify.mutate()}
                disabled={verify.isPending}
              >
                {verify.isPending ? "Verifying…" : "Verify chain + inclusion"}
              </button>
            }
          />

          {verifyResult ? (
            <div
              className={`${ui.alert} ${
                verifyResult.verification.ok ? ui.alertSuccess : ui.alertError
              }`}
            >
              <strong>{verifyResult.verification.ok ? "Valid" : "Invalid"}</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                <li>Chain: {verifyResult.verification.chain_ok ? "ok" : "fail"}</li>
                <li>
                  Inclusion:{" "}
                  {verifyResult.verification.inclusion_ok ? "ok" : "fail"}
                </li>
                {verifyResult.verification.root_hash ? (
                  <li className="mono" style={{ wordBreak: "break-all" }}>
                    Root: {verifyResult.verification.root_hash}
                  </li>
                ) : null}
                {verifyResult.verification.errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {e.action_kind === "provenance_claim" && e.payload ? (
            <ProvenanceClaimPanel
              claim={
                typeof (e.payload as Record<string, unknown>).claim === "string"
                  ? String((e.payload as Record<string, unknown>).claim)
                  : e.provenance_claim ?? ""
              }
              authority={
                typeof (e.payload as Record<string, unknown>).authority === "string"
                  ? String((e.payload as Record<string, unknown>).authority)
                  : e.provenance_authority
              }
              title="Signed provenance claim"
            />
          ) : e.provenance_claim ? (
            <ProvenanceClaimPanel
              claim={e.provenance_claim}
              authority={e.provenance_authority}
            />
          ) : null}

          {provenance ? (
            <div className={`${ui.card} ${ui.cardPad} ${ui.panel}`} style={{ marginBottom: "1.5rem" }}>
              <h2 className={ui.panelTitle}>What happened</h2>
              <p style={{ margin: "0 0 1rem", fontSize: "0.9375rem" }}>{provenance.summary}</p>
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(6rem, 8rem) 1fr",
                  gap: "0.5rem 1rem",
                  margin: 0,
                  fontSize: "0.875rem",
                }}
              >
                {provenance.lines.map((line) => (
                  <span key={line.label} style={{ display: "contents" }}>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>{line.label}</dt>
                    <dd style={{ margin: 0 }}>{line.value}</dd>
                  </span>
                ))}
              </dl>
            </div>
          ) : null}

          <div className={`${ui.card} ${ui.cardPad} ${ui.panel}`}>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(6rem, 8rem) 1fr",
                gap: "0.625rem 1rem",
                margin: 0,
                fontSize: "0.875rem",
              }}
            >
              <dt style={{ color: "var(--console-fg-subtle)" }}>Trace</dt>
              <dd className="mono">{e.trace_id}</dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Agent</dt>
              <dd className="mono">{e.agent_id}</dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Sequence</dt>
              <dd>{e.sequence_num}</dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Chain</dt>
              <dd>
                <StatusBadge status={e.chain_valid ? "ok" : "failed"} />
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Event hash</dt>
              <dd className="mono" style={{ wordBreak: "break-all" }}>
                {e.event_hash}
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Previous hash</dt>
              <dd className="mono" style={{ wordBreak: "break-all" }}>
                {e.prev_event_hash ?? "—"}
              </dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Emitted</dt>
              <dd>{new Date(e.emitted_at).toLocaleString()}</dd>
              <dt style={{ color: "var(--console-fg-subtle)" }}>Ingested</dt>
              <dd>{new Date(e.ingested_at).toLocaleString()}</dd>
            </dl>
          </div>

          {e.payload_enriched ? (
            <>
              <h2 className={ui.panelTitle}>Enriched provenance (B-202)</h2>
              <pre className={ui.pre}>{JSON.stringify(e.payload_enriched, null, 2)}</pre>
            </>
          ) : null}
          <h2 className={ui.panelTitle}>Payload (signed)</h2>
          <pre className={ui.pre}>{JSON.stringify(e.payload, null, 2)}</pre>
        </>
      ) : null}
    </ConsolePage>
  );
}
