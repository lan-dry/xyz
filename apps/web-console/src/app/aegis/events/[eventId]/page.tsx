"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ConsoleTime } from "@/components/console/console-time";
import { formatConsoleTime } from "@/lib/format-display";
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
import { useCaseSummaries } from "@/hooks/use-case-summaries";
import { consoleApi } from "@/lib/api";
import { idApi } from "@/lib/id-api";
import { agentLabel } from "@/lib/agent-label";
import { buildCaseStory, stepTitlePlain } from "@/lib/case-story";
import { buildEventProvenance, userFacingSummary } from "@/lib/event-provenance";
import { formatApprover, formatRuleLabel } from "@/lib/describe-decision";
import { outcomeFromPolicyDecision } from "@/lib/outcome-vocab";
import type { EventDetail, MeResponse, TraceSummary } from "@/lib/types";

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
      title: "Record intact: unchanged since it was sealed",
      className: ui.alertSuccess,
      inclusionLabel: "ok",
    };
  }
  if (status === "pending_inclusion") {
    return {
      title: "Record intact: signature chain unbroken",
      className: ui.alertSuccess,
      inclusionLabel: "pending",
      note: "Witness inclusion is still processing. Details stay under the seal checks below — the record itself is finished.",
    };
  }
  return {
    title: "Record check failed: the record may have been changed",
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

  const e = data?.event;
  const traceId = e?.trace_id;

  // Load the full case so the event page shows the same decision text as the case page (A4).
  const traceQuery = useQuery({
    queryKey: ["console", "trace", traceId],
    queryFn: () =>
      consoleApi<{
        trace: TraceSummary;
        events: EventDetail[];
      }>(`/traces/${encodeURIComponent(traceId!)}`),
    enabled: Boolean(traceId),
  });
  const summaryQuery = useCaseSummaries(traceId ? [traceId] : []);
  const caseSummary = traceId ? summaryQuery.data?.[traceId] : undefined;
  const caseStory =
    traceQuery.data
      ? buildCaseStory(traceQuery.data.events, {
          summary: caseSummary
            ? {
                required_role: caseSummary.required_role,
                amount: caseSummary.amount,
                currency: caseSummary.currency,
                product: caseSummary.product,
                event_type: caseSummary.event_type,
                rules: caseSummary.rules,
                decided_by_rule_id: caseSummary.decided_by_rule_id ?? null,
                approvers: caseSummary.approvers,
                requester: caseSummary.requester,
                requester_email: caseSummary.requester_email ?? null,
                requester_officer_id: caseSummary.requester_officer_id ?? null,
              }
            : null,
          traceId: traceQuery.data.trace.trace_id,
          agentId: traceQuery.data.trace.agent_id,
          agentName: agentLabel(
            traceQuery.data.trace.agent_name,
            traceQuery.data.trace.agent_id,
          ),
          status: traceQuery.data.trace.status,
          pendingApproval: traceQuery.data.trace.pending_approval,
          deniedEvents: traceQuery.data.trace.denied_events,
          startedAt: traceQuery.data.trace.started_at,
          provenance: caseSummary?.provenance ?? null,
        })
      : null;
  const caseDecision =
    caseStory?.bankDecision ??
    caseStory?.fourAnswers.whyAllowed.detail ??
    caseStory?.noApprovalNeeded ??
    null;

  const verify = useMutation({
    mutationFn: () =>
      consoleApi<VerifyResult>(
        `/events/${encodeURIComponent(eventId)}/verify`,
      ),
    onSuccess: (result) => setVerifyResult(result),
  });

  const p = e ? payloadRecord(e.payload_enriched ?? e.payload) : null;
  const outcome = e ? outcomeFromPolicyDecision(e.policy_decision) : null;
  const title = e
    ? stepTitlePlain(
        e.action_kind,
        e.tool_name,
        e.policy_decision,
        e.payload_enriched ?? e.payload,
      )
    : eventId;
  const provenance = e
    ? buildEventProvenance({
        tool_name: e.tool_name,
        action_kind: e.action_kind,
        policy_decision: e.policy_decision,
        payload: e.payload_enriched ?? e.payload,
        caseDecision,
      })
    : null;

  const amount =
    caseStory?.amountDisplay ??
    (typeof p?.amount_usd === "number" || typeof p?.amount === "number"
      ? (p.amount_usd ?? p.amount)
      : null);
  const reason =
    caseDecision ||
    (typeof p?.reason === "string" && p.reason) ||
    userFacingSummary(p?.investor_summary) ||
    null;
  const ruleId =
    caseStory?.ruleIds[0] ||
    (typeof p?.decided_by_rule_id === "string" && p.decided_by_rule_id) ||
    (typeof p?.rule_id === "string" && p.rule_id) ||
    null;
  const approver =
    caseStory?.approver ||
    formatApprover(
      typeof p?.approver_display_name === "string" ? p.approver_display_name : null,
      typeof p?.approver_role === "string" ? p.approver_role : null,
    ) ||
    (typeof p?.approver === "string" && p.approver) ||
    null;
  const decisionRaw =
    (typeof p?.decision === "string" && p.decision) ||
    caseStory?.approvalDecision ||
    null;
  const decision =
    decisionRaw === "approved" || decisionRaw === "released"
      ? "Approved"
      : decisionRaw === "rejected" ||
          decisionRaw === "declined" ||
          decisionRaw === "denied"
        ? "Declined"
        : decisionRaw &&
            decisionRaw !== "allow" &&
            decisionRaw !== "deny" &&
            decisionRaw !== "allow_with_obligation" &&
            decisionRaw !== "policy_decision"
          ? decisionRaw
          : e?.action_kind === "human_approval"
            ? outcome?.label ?? null
            : null;

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
                <span
                  style={{
                    marginLeft: "0.5rem",
                    display: "inline-block",
                    padding: "0.1rem 0.45rem",
                    borderRadius: "0.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    background: e.event_id.startsWith("evt_gov_")
                      ? "#b45309"
                      : "#047857",
                    color: "#fff",
                  }}
                  title={
                    e.event_id.startsWith("evt_gov_")
                      ? "No agent APS seal — provisional citation"
                      : "APS-1 sealed event"
                  }
                >
                  {e.event_id.startsWith("evt_gov_") ? "provisional" : "sealed"}
                </span>
                <span style={{ marginLeft: "0.5rem" }}>
                  {caseStory?.outcome.label ?? outcome.label}
                  {typeof amount === "string"
                    ? ` · ${amount}`
                    : typeof amount === "number"
                      ? ` · $${amount}`
                      : ""}
                  {" · "}
                  <ConsoleTime iso={e.emitted_at} />
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
                  {caseSummary?.provenance ? (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
                      {caseSummary.provenance.source_line}
                    </p>
                  ) : null}
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
                  {banner.note && banner.inclusionLabel === "pending" ? (
                    <p
                      style={{
                        margin: "0.75rem 0 0",
                        fontSize: "0.75rem",
                        color: "var(--console-fg-muted)",
                      }}
                    >
                      {banner.note}
                    </p>
                  ) : banner.note ? (
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
                {e.tool_name && e.tool_name !== "governed.action" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>System / tool</dt>
                    <dd className="mono" style={{ margin: "0 0 0.5rem" }}>
                      {e.tool_name}
                    </dd>
                  </>
                ) : null}
                {typeof amount === "string" ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Amount</dt>
                    <dd style={{ margin: "0 0 0.5rem" }}>{amount}</dd>
                  </>
                ) : typeof amount === "number" ? (
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

            <Panel title="Decision">
              <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                <dt style={{ color: "var(--console-fg-subtle)" }}>Outcome</dt>
                <dd style={{ margin: "0 0 0.5rem" }}>
                  {caseStory?.outcome.label ?? outcome.label}
                </dd>
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
                {ruleId && formatRuleLabel(ruleId) ? (
                  <>
                    <dt style={{ color: "var(--console-fg-subtle)" }}>Rule</dt>
                    <dd style={{ margin: 0, fontSize: "0.75rem" }}>
                      {formatRuleLabel(ruleId)}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Panel>

            <Panel title="Approval trail">
              {e.action_kind === "human_approval" ||
              approver ||
              caseStory?.approver ? (
                <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                  <dt style={{ color: "var(--console-fg-subtle)" }}>Who</dt>
                  <dd style={{ margin: "0 0 0.5rem" }}>
                    {approver ?? caseStory?.approver ?? "Recorded approver"}
                  </dd>
                  {decision ? (
                    <>
                      <dt style={{ color: "var(--console-fg-subtle)" }}>Decision</dt>
                      <dd style={{ margin: "0 0 0.5rem" }}>{decision}</dd>
                    </>
                  ) : null}
                  <dt style={{ color: "var(--console-fg-subtle)" }}>When</dt>
                  <dd style={{ margin: 0 }}>
                    {caseStory?.approvalAt
                      ? formatConsoleTime(caseStory.approvalAt)
                      : formatConsoleTime(e.emitted_at)}
                  </dd>
                </dl>
              ) : caseStory?.noApprovalNeeded ? (
                <p style={{ margin: 0, fontSize: "0.875rem" }}>
                  {caseStory.noApprovalNeeded}
                </p>
              ) : e.policy_decision === "allow_with_obligation" ||
                caseStory?.waitingForPerson ? (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
                  This step asked a person. Open the case timeline for the approval decision.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
                  No human approval is linked to this step.
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
