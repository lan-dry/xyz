"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ConsoleTime } from "@/components/console/console-time";
import {
  ErrorAlert,
  LoadingBlock,
  Modal,
  OutcomeChip,
  ui,
} from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";
import { formatRuleLabel, RULE_EFFECT_LABELS } from "@/lib/describe-decision";
import { idApi } from "@/lib/id-api";
import type { MeResponse } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Who is looking: admin-only actions                                  */
/* ------------------------------------------------------------------ */

const ADMIN_ROLES = new Set(["admin", "owner"]);

export function useIsAdmin(enabled = true): boolean {
  const me = useQuery({
    queryKey: ["me", "role"],
    enabled,
    queryFn: () => idApi<MeResponse>("/auth/me"),
    staleTime: 60_000,
  });
  const role = me.data?.user?.role?.trim().toLowerCase() ?? "";
  return ADMIN_ROLES.has(role);
}

/* ------------------------------------------------------------------ */
/* Typed confirmation (RETIRE / CREATE)                                */
/* ------------------------------------------------------------------ */

export function TypedConfirmModal({
  open,
  title,
  description,
  word,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  /** The word the person must type exactly, e.g. RETIRE. */
  word: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const matches = typed.trim() === word;

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      closeOnOverlayClick={false}
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={!matches || busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <label className={ui.field}>
        Type <strong>{word}</strong> to confirm
        <input
          className={ui.input}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-label={`Type ${word} to confirm`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches && !busy) onConfirm();
          }}
        />
      </label>
      {error ? <ErrorAlert message={error} /> : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Authority matrix                                                    */
/* ------------------------------------------------------------------ */

export type AuthorityRow = {
  matrix_id: string;
  product: string;
  product_label: string;
  amount_band: string;
  currency: string;
  risk_tier: string | null;
  risk_label: string;
  outcome: "allow" | "hold" | "stop";
  required_text: string;
  required_role_label: string | null;
  or_above: boolean;
  rule_code: string | null;
  rule_label: string | null;
};

export function useAuthorityMatrix() {
  return useQuery({
    queryKey: ["console", "authority-matrix"],
    queryFn: () => consoleApi<{ rows: AuthorityRow[] }>("/authority-matrix"),
  });
}

export function AuthorityMatrixTable() {
  const { data, isLoading, error } = useAuthorityMatrix();
  const rows = data?.rows ?? [];

  return (
    <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
      <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
        Who can approve what
      </h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
        The authority matrix. Each row says which approver, or anyone more senior, must
        approve a case of that product, size and risk.
      </p>
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorAlert message="Could not load the authority matrix." /> : null}
      {!isLoading && !error && rows.length === 0 ? (
        <p className={ui.cardHint}>No authority matrix is set up for this organization.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Amount band</th>
                <th>Risk</th>
                <th>Required approver</th>
                <th>Rule</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.matrix_id}>
                  <td>{r.product_label}</td>
                  <td>{r.amount_band}</td>
                  <td>{r.risk_label}</td>
                  <td>
                    {r.outcome === "allow" ? (
                      <span style={{ color: "var(--console-fg-muted)" }}>{r.required_text}</span>
                    ) : (
                      <strong>{r.required_text}</strong>
                    )}
                  </td>
                  <td>{r.rule_label ?? r.rule_code ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Demo Bank evaluator                                                 */
/* ------------------------------------------------------------------ */

type PreviewResponse = {
  preview: {
    outcome: "allow" | "hold" | "stop";
    outcome_label: string;
    deciding_rule: { code: string | null; label: string | null };
    required_text: string;
    required_role_label: string | null;
    explanation: string;
    policy_label: string;
  };
};

const RISK_FALLBACK = ["standard", "elevated", "high"];

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function BankRuleEvaluator() {
  const { data } = useAuthorityMatrix();
  const rows = data?.rows ?? [];

  const products = useMemo(() => {
    const seen = new Map<string, { label: string; currency: string }>();
    for (const r of rows) {
      if (!seen.has(r.product)) {
        seen.set(r.product, { label: r.product_label, currency: r.currency });
      }
    }
    return [...seen.entries()].map(([key, v]) => ({ key, ...v }));
  }, [rows]);

  const riskOptions = useMemo(() => {
    const tiers = rows.map((r) => r.risk_tier).filter((t): t is string => Boolean(t));
    return [...new Set([...tiers, ...RISK_FALLBACK])];
  }, [rows]);

  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("3000000");
  const [risk, setRisk] = useState("");
  const [score, setScore] = useState("");

  useEffect(() => {
    if (!product && products[0]) setProduct(products[0].key);
  }, [product, products]);

  // Currency comes from the tenant's authority matrix / pack — never invent one.
  const currency = products.find((p) => p.key === product)?.currency ?? "";

  const evaluate = useMutation({
    mutationFn: () =>
      consoleApi<PreviewResponse>("/rules/preview", {
        method: "POST",
        body: JSON.stringify({
          product,
          amount: Number(amount.replace(/,/g, "")),
          currency,
          risk_tier: risk || undefined,
          model_score: score.trim() === "" ? undefined : Number(score),
        }),
      }),
  });

  const result = evaluate.data?.preview;
  const amountOk = Number.isFinite(Number(amount.replace(/,/g, ""))) && amount.trim() !== "";

  return (
    <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
      <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
        Check a case against the rules
      </h2>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--console-fg-muted)" }}>
        Pick a product and an amount to see what the live rules would do. This is a
        preview only. Nothing is recorded.
      </p>
      <div className={ui.toolbar} style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
        <label className={ui.field} style={{ minWidth: "12rem" }}>
          Product
          <select
            className={ui.select}
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field} style={{ width: "11rem" }}>
          Amount ({currency})
          <input
            className={ui.input}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className={ui.field} style={{ minWidth: "9rem" }}>
          Risk class
          <select className={ui.select} value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="">Not specified</option>
            {riskOptions.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field} style={{ width: "10rem" }}>
          Credit score (optional)
          <input
            className={ui.input}
            inputMode="decimal"
            placeholder="0 to 1"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={!product || !amountOk || evaluate.isPending}
          onClick={() => evaluate.mutate()}
        >
          {evaluate.isPending ? "Checking…" : "Check"}
        </button>
      </div>
      {evaluate.error ? <ErrorAlert message={(evaluate.error as Error).message} /> : null}
      {result ? (
        <div
          className={`${ui.alert} ${
            result.outcome === "stop"
              ? ui.alertError
              : result.outcome === "allow"
                ? ui.alertSuccess
                : ui.alertInfo
          }`}
          style={{ marginTop: "0.75rem", marginBottom: 0 }}
          role="status"
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
            <OutcomeChip
              chip={result.outcome_label}
              kind={result.outcome === "hold" ? "ask_person" : result.outcome}
            />
            <strong>{result.explanation}</strong>
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.2rem 0.75rem", fontSize: "0.875rem" }}>
            <dt>Deciding rule</dt>
            <dd style={{ margin: 0 }}>{result.deciding_rule.label ?? "None matched"}</dd>
            <dt>Required approver</dt>
            <dd style={{ margin: 0 }}>{result.required_text}</dd>
            <dt>Policy</dt>
            <dd style={{ margin: 0 }}>{result.policy_label}</dd>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Version history (who published / co-approved) + readable diff       */
/* ------------------------------------------------------------------ */

export type RuleVersion = {
  policy_id: string;
  name: string;
  version: number;
  version_label: string;
  status: string;
  activated_at: string | null;
  dual_publish_required: boolean;
  approvals_recorded: number;
  published_by: { email: string | null; at: string } | null;
  co_approved_by: Array<{ email: string | null; at: string }>;
  awaiting_second_approver: boolean;
};

export function useRuleVersions(enabled = true) {
  return useQuery({
    // Under the "policies" prefix so activating or retiring refreshes it.
    queryKey: ["console", "policies", "rules-versions"],
    enabled,
    queryFn: () => consoleApi<{ versions: RuleVersion[] }>("/rules/versions"),
  });
}

export function who(email: string | null | undefined): string {
  return email?.trim() || "Unknown";
}

type DiffRule = {
  rule_id: string;
  tool_pattern?: string;
  decision?: string;
  priority?: number;
};

type DiffResponse = {
  left: { policy_id: string; version: number };
  right: { policy_id: string; version: number };
  added: DiffRule[];
  removed: DiffRule[];
  changed: Array<{ rule_id: string; from: DiffRule; to: DiffRule }>;
};

function effectText(decision: string | undefined): string {
  if (!decision) return "";
  return RULE_EFFECT_LABELS[decision] ?? decision.replace(/_/g, " ");
}

function ruleName(ruleId: string, decision?: string): string {
  const effect = decision === "allow_with_obligation" ? "hold" : decision === "deny" ? "stop" : decision;
  return formatRuleLabel(ruleId, effect) ?? ruleId;
}

function DiffList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "added" | "removed";
  items: DiffRule[];
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.9375rem" }}>{title}</h3>
      <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
        {items.map((r) => (
          <li key={r.rule_id} style={{ marginBottom: "0.25rem" }}>
            <strong>{ruleName(r.rule_id, r.decision)}</strong>{" "}
            <span style={{ color: "var(--console-fg-muted)" }}>
              {tone === "added" ? "now " : "used to "}
              {effectText(r.decision)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PolicyDiffModal({
  open,
  version,
  against,
  onClose,
}: {
  open: boolean;
  version: RuleVersion | null;
  /** The version to compare against (normally the one before). */
  against: RuleVersion | null;
  onClose: () => void;
}) {
  const enabled = open && Boolean(version && against);
  const diff = useQuery({
    queryKey: ["console", "policy-diff", version?.policy_id, against?.policy_id],
    enabled,
    queryFn: () =>
      consoleApi<DiffResponse>(
        `/policies/${encodeURIComponent(version!.policy_id)}/diff?against=${encodeURIComponent(against!.policy_id)}`,
      ),
  });
  const d = diff.data;
  const nothing = d && d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;

  return (
    <Modal
      open={open}
      title={
        version && against
          ? `What changed: ${against.version_label} to ${version.version_label}`
          : "What changed"
      }
      description="Rules added, removed or changed between the two versions."
      wide
      onClose={onClose}
      footer={
        <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose}>
          Close
        </button>
      }
    >
      {!against ? (
        <p className={ui.cardHint}>There is no earlier version to compare with.</p>
      ) : null}
      {diff.isLoading && enabled ? <LoadingBlock /> : null}
      {diff.error ? <ErrorAlert message="Could not compare these versions." /> : null}
      {nothing ? (
        <p className={ui.cardHint}>The rules are identical in these two versions.</p>
      ) : null}
      {d ? (
        <>
          <DiffList title="Added in this version" tone="added" items={d.added} />
          <DiffList title="Removed in this version" tone="removed" items={d.removed} />
          {d.changed.length > 0 ? (
            <div>
              <h3 style={{ margin: "0 0 0.35rem", fontSize: "0.9375rem" }}>Changed</h3>
              <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
                {d.changed.map((c) => (
                  <li key={c.rule_id} style={{ marginBottom: "0.25rem" }}>
                    <strong>{ruleName(c.rule_id, c.to.decision)}</strong>:{" "}
                    {effectText(c.from.decision)} became {effectText(c.to.decision)}
                    {c.from.priority !== c.to.priority
                      ? `, priority ${c.from.priority} became ${c.to.priority}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}

export function PublishedByCell({ v }: { v: RuleVersion }) {
  if (!v.published_by) {
    return <span style={{ color: "var(--console-fg-muted)" }}>-</span>;
  }
  return (
    <div style={{ fontSize: "0.8125rem" }}>
      <div>{who(v.published_by.email)}</div>
      {v.co_approved_by.length > 0 ? (
        <div style={{ color: "var(--console-fg-muted)" }}>
          Co-approved by {v.co_approved_by.map((c) => who(c.email)).join(", ")}
        </div>
      ) : v.dual_publish_required && v.status === "active" ? (
        <div style={{ color: "var(--console-fg-muted)" }}>No co-approver recorded</div>
      ) : null}
    </div>
  );
}

export function ActivatedCell({ v }: { v: RuleVersion | undefined; }) {
  return v?.activated_at ? <ConsoleTime iso={v.activated_at} /> : <>Not live</>;
}

/* ------------------------------------------------------------------ */
/* Dual publish explanation                                            */
/* ------------------------------------------------------------------ */

export function DualPublishExplainer() {
  return (
    <section className={`${ui.card} ${ui.cardPad}`} style={{ marginBottom: "1.25rem" }}>
      <h2 className={ui.panelTitle} style={{ marginTop: 0 }}>
        Two people publish a rule change
      </h2>
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--console-fg-muted)", lineHeight: 1.5 }}>
        A new version of the rules goes live only after two different authorised people
        activate it. If you activate a version on your own, it is not live yet: it waits
        for a second approver, and activating it a second time yourself does not count.
        The version list shows who published each version and who co-approved it.
      </p>
    </section>
  );
}
