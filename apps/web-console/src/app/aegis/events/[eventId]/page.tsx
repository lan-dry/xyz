"use client";

import Link from "next/link";
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
import { ProvenanceClaimPanel } from "@/components/console/provenance-claim-panel";
import { PublicVerifyShare } from "@/components/console/public-verify-share";
import { consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { stepTitlePlain } from "@/lib/case-story";
import { buildEventProvenance } from "@/lib/event-provenance";
import { outcomeFromPolicyDecision } from "@/lib/outcome-vocab";
import type { EventDetail, MeResponse } from "@/lib/types";

type VerifyResult = {
  verification: {
    ok: boolean;
    status?: "valid" | "pending_inclusion" | "invalid";
    chain_ok: boolean;
    inclusion_ok: boolean;
    inclusion_status?: "ok" | "pending" | "fail";
    has_proof?: boolean;
    errors: string[];
    root_hash?: string;
  };
  inclusion_proof: {
    root_id: string;
    root_hash: string;
    leaf_index: number;
  } | null;
};

function verifyBanner(v: VerifyResult["verification"]): {
  title: string;
  className: string;
  inclusionLabel: string;
  note?: string;
} {
  const status =
    v.status ??
    (!v.chain_ok
      ? "invalid"
      : v.inclusion_ok
        ? "valid"
        : v.has_proof === false ||
            v.errors.includes("no_inclusion_proof") ||
            v.inclusion_status === "pending"
          ? "pending_inclusion"
          : "invalid");

  if (status === "valid") {
    return {
      title: "Verified: unchanged since it was sealed",
      className: ui.alertSuccess,
      inclusionLabel: "ok",
    };
  }
  if (status === "pending_inclusion") {
    return {
      title: "Seal intact · witness inclusion pending",
      className: ui.alertInfo,
      inclusionLabel: "pending",
      note: "The signature chain is intact. Merkle inclusion proofs are added by the witness batch. This is not a tamper signal.",
    };
  }
  return {
    title: "Verification failed: the record may have been changed",
    className: ui.alertError,
    inclusionLabel:
      v.inclusion_status ??
      (v.inclusion_ok ? "ok" : v.has_proof === false ? "pending" : "fail"),
  };
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : null;
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1rem" }}>
      <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

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

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
  });
  const orgSlug = meQuery.data?.organization?.slug ?? "";

  const verify = useMutation({
    mutationFn: () =>
      consoleApi<VerifyResult>(
        `/events/${encodeURIComponent(eventId)}/verify`,
      ),
    onSuccess: (result) => setVerifyResult(result),
  });

  const e = data?.event;
  const p = e ? payloadRecord(e.payload_enriched ?? e.payload) : null;
  const outcome = e ? outcomeFromPolicyDecision(e.policy_decision) : null;
  const title = e
    ? stepTitlePlain(e.action_kind, e.tool_name, e.policy_decision)
    : eventId;
  const provenance = e
    ? buildEventProvenance({
        tool_name: e.tool_name,
        action_kind: e.action_kind,
        policy_decision: e.policy_decision,
        payload: e.payload_enriched ?? e.payload,
      })
    : null;

  const amount = p?.amount_usd ?? p?.amount;
  const reason =
    (typeof p?.reason === "string" && p.reason) ||
    (typeof p?.investor_summary === "string" && p.investor_summary) ||
    null;
  const policyId = typeof p?.policy_id === "string" ? p.policy_id : null;
  const ruleId = typeof p?.rule_id === "string" ? p.rule_id : null;
  const approver =
    (typeof p?.approver_email === "string" && p.approver_email) ||
    (typeof p?.approver === "string" && p.approver) ||
    null;
  const decision =
    (typeof p?.decision === "string" && p.decision) || e?.policy_decision || null;

  return (
    <ConsolePage>
      {e ? (
        <BackLink href={`/aegis/traces/${encodeURIComponent(e.trace_id)}`}>
          ← Case
        </BackLink>
      ) : null}
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Receipt not found or failed to load." /> : null}
      {e && outcome ? (
        <>
          <PageHeader
            title={title}
            subtitle={
              <>
                <StatusBadge status={e.policy_decision} />
                <span style={{ marginLeft: "0.5rem" }}>
                  {outcome.label}
                  {typeof amount === "number" ? ` · $${amount}` : ""}
                  {" · "}
                  {new Date(e.emitted_at).toLocaleString()}
                </span>
              </>
            }
            actions={
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => verify.mutate()}
                disabled={verify.isPending}
              >
                {verify.isPending ? "Verifying…" : "Verify now"}
              </button>
            }
          />

          {provenance?.summary ? (
            <p style={{ margin: "0 0 1.25rem", fontSize: "1rem", lineHeight: 1.5 }}>
              {provenance.summary}
            </p>
          ) : null}

          {verifyResult ? (
            (() => {
              const banner = verifyBanner(verifyResult.verification);
              const displayErrors = verifyResult.verification.errors.filter(
                (err) => err !== "no_inclusion_proof",
              );
              return (
                <div
                  className={`${ui.alert} ${banner.className}`}
                  style={{ marginBottom: "1rem" }}
                >
                  <strong>{banner.title}</strong>
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
                    <li>
                      Chain: {verifyResult.verification.chain_ok ? "ok" : "fail"}
                    </li>
                    <li>Inclusion: {banner.inclusionLabel}</li>
                    {verifyResult.verification.root_hash ? (
                      <li className="mono" style={{ wordBreak: "break-all" }}>
                        Root: {verifyResult.verification.root_hash}
                      </li>
                    ) : null}
                    {displayErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                  {banner.note ? (
                    <p style={{ margin: "0.75rem 0 0", fontSize: "0.8125rem" }}>
                      {banner.note}
                    </p>
                  ) : null}
                </div>
              );
            })()
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <Panel title="Action">
              <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                <dt style={{ color: "var(--console-fg-subtle)" }}>What</dt>
                <dd style={{ margin: "0 0 0.5rem" }}>{title}</dd>
                {e.tool_name ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>System / tool</dt>
                    <dd className="mono" style={{ margin: "0 0 0.5rem" }}>
                      {e.tool_name}
                    </dd>
                  </>
                ) : null}
                {typeof amount === "number" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Amount</dt>
                    <dd style={{ margin: "0 0 0.5rem" }}>${amount} USD</dd>
                  </>
                ) : null}
                {Array.isArray(p?.data_touched) && p.data_touched.length > 0 ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Data touched</dt>
                    <dd style={{ margin: 0 }}>
                      {(p.data_touched as unknown[])
                        .filter((x): x is string => typeof x === "string")
                        .join(", ")}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Panel>

            <Panel title="Policy">
              <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                <dt style={{ color: "var(--console-fg-subtle)" }}>Outcome</dt>
                <dd style={{ margin: "0 0 0.5rem" }}>{outcome.label}</dd>
                {reason ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Why</dt>
                    <dd style={{ margin: "0 0 0.5rem" }}>{reason}</dd>
                  </>
                ) : (
                  <dd style={{ margin: "0 0 0.5rem", color: "var(--console-fg-muted)" }}>
                    No rule reason attached on this step.
                  </dd>
                )}
                {typeof p?.decision_layer === "string" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Decision layer</dt>
                    <dd style={{ margin: "0 0 0.5rem" }}>
                      <StatusBadge status={String(p.decision_layer)} />
                      {p.decision_layer === "ceiling"
                        ? " (hard ceiling stopped this even if a contextual rule would allow)"
                        : null}
                    </dd>
                  </>
                ) : null}
                {p?.signals && typeof p.signals === "object" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Model signal</dt>
                    <dd style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem" }}>
                      {typeof (p.signals as Record<string, unknown>).risk_score ===
                      "number" ? (
                        <span>
                          Score{" "}
                          <strong>
                            {String((p.signals as Record<string, unknown>).risk_score)}
                          </strong>
                          {(p.signals as Record<string, unknown>).band
                            ? ` · band ${String((p.signals as Record<string, unknown>).band)}`
                            : ""}
                          {(p.signals as Record<string, unknown>).model_name
                            ? ` · ${String((p.signals as Record<string, unknown>).model_name)}`
                            : ""}
                          {(p.signals as Record<string, unknown>).model_version
                            ? ` ${String((p.signals as Record<string, unknown>).model_version)}`
                            : ""}
                          {(p.signals as Record<string, unknown>).signal_fallback
                            ? ` · fallback ${String((p.signals as Record<string, unknown>).signal_fallback)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="mono" style={{ fontSize: "0.75rem" }}>
                          {JSON.stringify(p.signals)}
                        </span>
                      )}
                    </dd>
                  </>
                ) : null}
                {policyId ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Policy</dt>
                    <dd className="mono" style={{ margin: "0 0 0.5rem", fontSize: "0.75rem" }}>
                      {policyId}
                    </dd>
                  </>
                ) : null}
                {ruleId ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Rule</dt>
                    <dd className="mono" style={{ margin: 0, fontSize: "0.75rem" }}>
                      {ruleId}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Panel>

            <Panel title="Approval trail">
              {e.action_kind === "human_approval" || approver ? (
                <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                  <dt style={{ color: "var(--console-fg-subtle)" }}>Who</dt>
                  <dd style={{ margin: "0 0 0.5rem" }}>{approver ?? "Recorded approver"}</dd>
                  <dt style={{ color: "var(--console-fg-subtle)" }}>Decision</dt>
                  <dd style={{ margin: "0 0 0.5rem" }}>{decision}</dd>
                  <dt style={{ color: "var(--console-fg-subtle)" }}>When</dt>
                  <dd style={{ margin: 0 }}>{new Date(e.emitted_at).toLocaleString()}</dd>
                </dl>
              ) : e.policy_decision === "allow_with_obligation" ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
                  This step asked a person. Open the case timeline for the approval decision.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
                  No human approval on this step: policy allowed or stopped automatically.
                </p>
              )}
            </Panel>

            <Panel title="Proof">
              <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                <dt style={{ color: "var(--console-fg-subtle)" }}>Chain</dt>
                <dd style={{ margin: "0 0 0.5rem" }}>
                  <StatusBadge status={e.chain_valid ? "ok" : "failed"} />
                </dd>
                {typeof p?.approved_action_match === "boolean" ||
                typeof p?.approved_action_digest === "string" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>
                      Approved action matches executed action
                    </dt>
                    <dd style={{ margin: "0 0 0.5rem" }}>
                      {p?.approved_action_match === false ? (
                        <StatusBadge status="failed" />
                      ) : (
                        <StatusBadge status="ok" />
                      )}{" "}
                      {p?.approved_action_match === false
                        ? "No: parameters changed after approval"
                        : "Yes"}
                    </dd>
                  </>
                ) : null}
                <dt style={{ color: "var(--console-fg-subtle)" }}>Event hash</dt>
                <dd className="mono" style={{ margin: "0 0 0.5rem", wordBreak: "break-all", fontSize: "0.75rem" }}>
                  {e.event_hash}
                </dd>
                <dt style={{ color: "var(--console-fg-subtle)" }}>Previous hash</dt>
                <dd className="mono" style={{ margin: "0 0 0.75rem", wordBreak: "break-all", fontSize: "0.75rem" }}>
                  {e.prev_event_hash ?? "- (chain root)"}
                </dd>
              </dl>
              <Link
                href={`/verify`}
                className={`${ui.btn} ${ui.btnSecondary}`}
                style={{ fontSize: "0.8125rem" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open public Verify
              </Link>
            </Panel>
          </div>

          {orgSlug ? (
            <PublicVerifyShare organizationSlug={orgSlug} eventId={e.event_id} />
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

          <details style={{ marginTop: "0.5rem" }}>
            <summary
              className={ui.panelTitle}
              style={{ cursor: "pointer", fontSize: "0.9375rem" }}
            >
              Technical details
            </summary>
            <p style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
              Case{" "}
              <Link
                href={`/aegis/traces/${encodeURIComponent(e.trace_id)}`}
                className={`${ui.tableLink} mono`}
              >
                {e.trace_id}
              </Link>{" "}
              · agent <code className="mono">{e.agent_id}</code> · seq {e.sequence_num} ·{" "}
              <code className="mono">{e.action_kind}</code>
            </p>
            <h3 className={ui.panelTitle}>Signed payload</h3>
            <pre className={ui.pre}>{JSON.stringify(e.payload, null, 2)}</pre>
            {e.payload_enriched ? (
              <>
                <h3 className={ui.panelTitle}>Enriched provenance</h3>
                <pre className={ui.pre}>{JSON.stringify(e.payload_enriched, null, 2)}</pre>
              </>
            ) : null}
          </details>
        </>
      ) : null}
    </ConsolePage>
  );
}
