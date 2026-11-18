/**
 * Risk Approval Pack: human-readable facts for committee sign-off.
 * No engine vocabulary (no policy_decision, merkle, etc.).
 */
import type pg from "pg";
import { custodyLabel, configuredCustody } from "../crypto/receipt-signing.js";
import { formatRuleLabel, formatRoleLabel } from "../bank/describe-decision.js";
import { buildAuthorityMatrixView } from "../bank/rule-preview.js";
import { listAuthorityMatrix, listBankRoleLadder } from "../bank/repo.js";
import { renderOnePagePdf, type PdfLine } from "../forensic/minimal-pdf.js";
import { fingerprintOfPublicKey } from "../repo/receipt-keys.js";
import { configuredReceiptKey } from "../forensic/evidence-bundle.js";

export type RiskApprovalPack = {
  pack_type: "risk_approval_pack";
  generated_at: string;
  organization: {
    organization_id: string;
    name: string | null;
    slug: string | null;
  };
  authority_matrix: Array<{
    product: string;
    currency: string;
    amount_min: number | null;
    amount_max: number | null;
    required_role: string;
    outcome: string;
  }>;
  rules: Array<{
    code: string;
    title: string;
    version: number;
    content_hash: string | null;
  }>;
  volumes_by_outcome: Array<{ outcome: string; count: number }>;
  sample_cases: Array<{
    case_id: string | null;
    plain_words: string;
    outcome: string;
    amount: string | null;
    when: string;
  }>;
  key_custody: {
    label: string;
    key_id: string | null;
    fingerprint: string | null;
  };
  time_authority: {
    label: string;
    detail: string;
  };
  sign_off: {
    statement: string;
    fields: string[];
  };
};

function kigaliStamp(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kigali",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")} (Africa/Kigali)`;
}

function money(amount: unknown, currency: unknown): string | null {
  const n =
    typeof amount === "number"
      ? amount
      : typeof amount === "string"
        ? Number(amount)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const cur = typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "";
  const formatted = Math.round(n).toLocaleString("en-US");
  return cur ? `${cur} ${formatted}` : formatted;
}

function plainOutcome(raw: string | null | undefined): string {
  switch ((raw ?? "").toLowerCase()) {
    case "allow":
      return "Allowed";
    case "hold":
    case "allow_with_obligation":
      return "Held for a person";
    case "stop":
    case "deny":
      return "Stopped";
    case "approved":
      return "Released after approval";
    case "rejected":
    case "declined":
      return "Declined";
    default:
      return raw?.trim() ? raw : "Recorded";
  }
}

export async function buildRiskApprovalPack(
  pool: pg.Pool | pg.PoolClient,
  orgId: string,
): Promise<RiskApprovalPack> {
  const org = await pool.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM organization WHERE organization_id = $1`,
    [orgId],
  );

  const ladder = await listBankRoleLadder(pool, orgId).catch(() => []);
  const matrixRows = await listAuthorityMatrix(pool, orgId).catch(() => []);
  const authority_matrix = buildAuthorityMatrixView(matrixRows, ladder).map((r) => ({
    product: r.product,
    currency: r.currency,
    amount_min: r.amount_min,
    amount_max: r.amount_max,
    required_role:
      r.required_role_label ||
      formatRoleLabel(r.required_role) ||
      r.required_role ||
      "—",
    outcome: plainOutcome(r.outcome),
  }));

  const policies = await pool.query<{
    policy_id: string;
    name: string;
    version: number;
    content_hash: string | null;
  }>(
    `SELECT policy_id, name, version, content_hash FROM policy
     WHERE organization_id = $1 AND status = 'active'
     ORDER BY activated_at DESC NULLS LAST LIMIT 5`,
    [orgId],
  );

  const rules: RiskApprovalPack["rules"] = [];
  for (const p of policies.rows) {
    const ruleRows = await pool.query<{ rule_id: string }>(
      `SELECT rule_id FROM policy_rule WHERE policy_id = $1 ORDER BY priority DESC LIMIT 20`,
      [p.policy_id],
    );
    for (const rr of ruleRows.rows) {
      const label = formatRuleLabel(rr.rule_id) ?? rr.rule_id;
      const code = label.includes(" · ") ? label.split(" · ")[0]! : rr.rule_id;
      const title = label.includes(" · ") ? label.split(" · ").slice(1).join(" · ") : p.name;
      rules.push({
        code,
        title,
        version: p.version,
        content_hash: p.content_hash,
      });
    }
  }

  const volumes = await pool.query<{ outcome: string; count: string }>(
    `SELECT COALESCE(outcome, 'unknown') AS outcome, COUNT(*)::text AS count
     FROM bank_case
     WHERE organization_id = $1
     GROUP BY COALESCE(outcome, 'unknown')
     ORDER BY COUNT(*) DESC`,
    [orgId],
  ).catch(() => ({ rows: [] as Array<{ outcome: string; count: string }> }));

  const samples = await pool.query<{
    case_id: string;
    outcome: string | null;
    attributes: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT case_id, outcome, attributes, created_at
     FROM bank_case
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [orgId],
  ).catch(() => ({ rows: [] as Array<{
    case_id: string;
    outcome: string | null;
    attributes: Record<string, unknown> | null;
    created_at: Date;
  }> }));

  const sample_cases = samples.rows.map((r) => {
    const a = r.attributes ?? {};
    const amt = money(a.amount ?? a.amount_rwf, a.currency);
    const purpose =
      typeof a.loan_purpose === "string"
        ? a.loan_purpose
        : typeof a.purpose === "string"
          ? a.purpose
          : null;
    const branch = typeof a.branch === "string" ? a.branch : null;
    const bits = [
      plainOutcome(r.outcome),
      amt ? `amount ${amt}` : null,
      purpose ? `purpose: ${purpose}` : null,
      branch ? `branch ${branch}` : null,
    ].filter(Boolean);
    return {
      case_id: r.case_id,
      plain_words: bits.join("; ") || "Case recorded.",
      outcome: plainOutcome(r.outcome),
      amount: amt,
      when: kigaliStamp(r.created_at),
    };
  });

  const keys = await configuredReceiptKey();
  const keyId = Object.keys(keys)[0] ?? null;
  const pub = keyId ? keys[keyId] ?? null : null;
  const custody = configuredCustody();

  const tsa =
    process.env.AEGIS_TSA_URL?.trim() ||
    "http://timestamp.sectigo.com";

  return {
    pack_type: "risk_approval_pack",
    generated_at: new Date().toISOString(),
    organization: {
      organization_id: orgId,
      name: org.rows[0]?.name ?? null,
      slug: org.rows[0]?.slug ?? null,
    },
    authority_matrix,
    rules,
    volumes_by_outcome: volumes.rows.map((v) => ({
      outcome: plainOutcome(v.outcome),
      count: Number(v.count),
    })),
    sample_cases,
    key_custody: {
      label: custodyLabel(custody),
      key_id: keyId,
      fingerprint: pub ? fingerprintOfPublicKey(pub) : null,
    },
    time_authority: {
      label: "Public RFC 3161 time authority",
      detail: `Stamps come from ${tsa}. A stamp may stay pending; the record remains valid either way.`,
    },
    sign_off: {
      statement:
        "I have reviewed the authority matrix, active rules (version and hash), case volumes, sample cases, key custody and time authority in this pack, and approve them for the stated pilot scope.",
      fields: ["name", "role", "date", "signature"],
    },
  };
}

/** Compact multi-section PDF (may truncate if very long). */
export function renderRiskApprovalPdf(pack: RiskApprovalPack): Buffer {
  const lines: PdfLine[] = [];
  lines.push({ text: "Risk Approval Pack", bold: true, size: 18 });
  lines.push({
    text: pack.organization.name
      ? `${pack.organization.name} — committee sign-off`
      : "Committee sign-off",
    size: 10,
  });
  lines.push({
    text: `Prepared ${kigaliStamp(pack.generated_at)}`,
    size: 9,
  });

  lines.push({ text: "Authority matrix", bold: true, size: 12, gapBefore: 12 });
  if (pack.authority_matrix.length === 0) {
    lines.push({ text: "No authority bands configured." });
  } else {
    for (const row of pack.authority_matrix.slice(0, 12)) {
      const band =
        row.amount_min != null || row.amount_max != null
          ? `${row.amount_min ?? 0}–${row.amount_max ?? "∞"} ${row.currency}`
          : row.currency;
      lines.push({
        text: `${row.product}: ${band} → ${row.required_role} (${row.outcome})`,
        size: 9,
      });
    }
  }

  lines.push({ text: "Rules in force", bold: true, size: 12, gapBefore: 10 });
  if (pack.rules.length === 0) {
    lines.push({ text: "No active rules listed." });
  } else {
    const seen = new Set<string>();
    for (const r of pack.rules) {
      const key = `${r.code}|${r.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({
        text: `${r.code} — ${r.title} (version ${r.version}${r.content_hash ? `; hash ${r.content_hash.slice(0, 16)}…` : ""})`,
        size: 9,
      });
    }
  }

  lines.push({ text: "Volumes by outcome", bold: true, size: 12, gapBefore: 10 });
  if (pack.volumes_by_outcome.length === 0) {
    lines.push({ text: "No cases yet." });
  } else {
    for (const v of pack.volumes_by_outcome) {
      lines.push({ text: `${v.outcome}: ${v.count}`, size: 9 });
    }
  }

  lines.push({ text: "Sample cases", bold: true, size: 12, gapBefore: 10 });
  if (pack.sample_cases.length === 0) {
    lines.push({ text: "No sample cases." });
  } else {
    for (const c of pack.sample_cases) {
      lines.push({
        text: `${c.case_id ?? "case"} — ${c.plain_words} (${c.when})`,
        size: 8,
      });
    }
  }

  lines.push({ text: "Key custody", bold: true, size: 12, gapBefore: 10 });
  lines.push({ text: pack.key_custody.label, size: 9 });
  if (pack.key_custody.key_id) {
    lines.push({
      text: `Key ${pack.key_custody.key_id}${pack.key_custody.fingerprint ? `; ${pack.key_custody.fingerprint}` : ""}`,
      size: 8,
    });
  }

  lines.push({ text: "Time authority", bold: true, size: 12, gapBefore: 10 });
  lines.push({ text: pack.time_authority.label, size: 9 });
  lines.push({ text: pack.time_authority.detail, size: 8 });

  lines.push({ text: "Sign-off", bold: true, size: 12, gapBefore: 12 });
  lines.push({ text: pack.sign_off.statement, size: 9 });
  lines.push({ text: "Name: ____________________________", size: 9, gapBefore: 8 });
  lines.push({ text: "Role: _____________________________", size: 9, gapBefore: 4 });
  lines.push({ text: "Date: _____________________________", size: 9, gapBefore: 4 });
  lines.push({ text: "Signature: ________________________", size: 9, gapBefore: 4 });
  lines.push({
    text: "Machine-readable pack.json is attached in the download ZIP.",
    size: 8,
    gapBefore: 10,
  });

  return renderOnePagePdf(lines, "Risk Approval Pack");
}
