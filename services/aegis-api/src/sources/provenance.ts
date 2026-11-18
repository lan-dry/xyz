/**
 * Stage 2: honest labelling. The provenance block sealed into every new forensic receipt says
 * WHERE the data came from and HOW MUCH is vouched for. It never says the data is true.
 *
 * The block lives at `receipt.provenance` and is covered by the receipt hash and signature, so
 * editing it (even one character) breaks verification. Receipts issued before Stage 2 have no
 * block; they still verify and read as grade G0 "legacy" (or G1 when they carry a Stage 1
 * source envelope).
 *
 * Everything here is pure (no database) so the bundle builder, the offline verifier, the case
 * API, the PDF and the share link all derive the same wording from the same signed facts.
 */
import { EVIDENCE_GRADES, type EvidenceGrade } from "./grade.js";

export const PROVENANCE_AUTHENTICATIONS = [
  "bearer_key",
  "source_signature",
  "mtls",
] as const;
export type ProvenanceAuthentication =
  (typeof PROVENANCE_AUTHENTICATIONS)[number];

export const FIELD_ASSERTIONS = [
  "asserted_by_source",
  "derived_by_aegis",
  "corroborated",
  "independently_captured",
] as const;
export type FieldAssertion = (typeof FIELD_ASSERTIONS)[number];

export const PROVENANCE_CHECK_IDS = [
  "source_signed",
  "approver_bound",
  "execution_matched",
  "reconciled",
  "independently_captured",
] as const;
export type ProvenanceCheckId = (typeof PROVENANCE_CHECK_IDS)[number];
export type ProvenanceChecks = Record<ProvenanceCheckId, boolean>;

/** Fixed plain text sealed into every block. Do not reword per receipt. */
export const PROVENANCE_LIMITATIONS =
  "Aegis proves when this record was made and that it has not changed since. " +
  "It does not check that the data is accurate. Fields marked as asserted by the source " +
  "are the source's own claim.";

/** The sentence every screen and export may repeat. */
export const DOES_NOT_VERIFY_ACCURACY =
  "Aegis does not check that the data is accurate.";

/** Plain labels for the five-fact checklist (case page, PDF, verify page). */
export const PROVENANCE_CHECK_LABELS: Record<ProvenanceCheckId, string> = {
  source_signed: "Signed by the source system with its own key",
  approver_bound: "Approver identity bound to the decision",
  execution_matched: "What was carried out matched what was approved",
  reconciled: "Reconciled against another record",
  independently_captured: "Captured independently of the source",
};

export type ProvenanceBlock = {
  schema_version: 1;
  source_id: string;
  source_name: string;
  /** Registry key that signed the event (source_signature only). */
  source_key_id: string | null;
  authentication: ProvenanceAuthentication;
  /** Grade at the moment this receipt was sealed. Grades can rise later (grade_change receipts). */
  evidence_grade: EvidenceGrade;
  /** Same value as evidence_grade, named for the offline reader. */
  grade_at_seal: EvidenceGrade;
  field_assertions: Record<string, FieldAssertion>;
  checks: ProvenanceChecks;
  limitations: string;
  recorded_at: string;
};

export function emptyChecks(): ProvenanceChecks {
  return {
    source_signed: false,
    approver_bound: false,
    execution_matched: false,
    reconciled: false,
    independently_captured: false,
  };
}

export function gradeRank(grade: EvidenceGrade): number {
  return EVIDENCE_GRADES.indexOf(grade);
}

export function maxGrade(...grades: EvidenceGrade[]): EvidenceGrade {
  return grades.reduce<EvidenceGrade>(
    (best, g) => (gradeRank(g) > gradeRank(best) ? g : best),
    "G0",
  );
}

export function isEvidenceGrade(v: unknown): v is EvidenceGrade {
  return typeof v === "string" && (EVIDENCE_GRADES as readonly string[]).includes(v);
}

/**
 * Grade follows the checks, never the other way round:
 * G3 independently captured, G2 corroborated (execution matched or reconciled),
 * G1 source-signed, else G0. approver_bound alone does not raise the grade.
 */
export function gradeFromChecks(checks: ProvenanceChecks): EvidenceGrade {
  if (checks.independently_captured) return "G3";
  if (checks.reconciled || checks.execution_matched) return "G2";
  if (checks.source_signed) return "G1";
  return "G0";
}

export function mergeChecks(
  ...all: Array<Partial<ProvenanceChecks> | null | undefined>
): ProvenanceChecks {
  const out = emptyChecks();
  for (const c of all) {
    if (!c) continue;
    for (const id of PROVENANCE_CHECK_IDS) {
      if (c[id] === true) out[id] = true;
    }
  }
  return out;
}

/** Attribute keys Aegis computes itself (everything else in the attributes is the source's claim). */
const DERIVED_ATTRIBUTE_KEYS = new Set([
  "required_role",
  "required_role_label",
  "requester_missing",
  "follows_receipt_hash",
  "follows_receipt_id",
  "approval_id",
  "approval_decision",
]);

/** Provenance bookkeeping keys that are not business data. */
const BOOKKEEPING_KEYS = new Set([
  "source_envelope",
  "source_id",
  "source_key_id",
  "evidence_grade",
  "checks",
  "provenance",
  "demo_history",
]);

/** Receipt-level fields Aegis always derives from the policy. */
const ALWAYS_DERIVED_FIELDS = [
  "outcome",
  "matched_rules",
  "policy",
  "decision_basis",
  "plain_summary",
] as const;

const MAX_ASSERTED_FIELDS = 200;

/**
 * Per-field assertion map. Business fields the source sent are `asserted_by_source`; fields Aegis
 * computed (outcome, rules, required role, approver binding) are `derived_by_aegis`.
 * `overrides` lets later stages mark fields `corroborated` / `independently_captured`.
 */
export function buildFieldAssertions(
  attributeKeys: string[],
  options?: {
    derivedKeys?: string[];
    overrides?: Record<string, FieldAssertion>;
  },
): Record<string, FieldAssertion> {
  const out: Record<string, FieldAssertion> = {};
  const derived = new Set(options?.derivedKeys ?? []);
  for (const key of attributeKeys.slice(0, MAX_ASSERTED_FIELDS)) {
    if (BOOKKEEPING_KEYS.has(key)) continue;
    out[key] =
      derived.has(key) || DERIVED_ATTRIBUTE_KEYS.has(key)
        ? "derived_by_aegis"
        : "asserted_by_source";
  }
  for (const key of ALWAYS_DERIVED_FIELDS) out[key] = "derived_by_aegis";
  for (const [key, how] of Object.entries(options?.overrides ?? {})) {
    out[key] = how;
  }
  return out;
}

export type BuildProvenanceInput = {
  source_id: string;
  source_name: string;
  source_key_id?: string | null;
  authentication: ProvenanceAuthentication;
  checks?: Partial<ProvenanceChecks>;
  field_assertions?: Record<string, FieldAssertion>;
  /** Wall clock when Aegis wrote the receipt. */
  recorded_at: string;
};

export function buildProvenanceBlock(
  input: BuildProvenanceInput,
): ProvenanceBlock {
  const checks = mergeChecks(input.checks, {
    source_signed: input.authentication === "source_signature",
  });
  const grade = gradeFromChecks(checks);
  return {
    schema_version: 1,
    source_id: input.source_id,
    source_name: input.source_name.trim() || input.source_id,
    source_key_id: input.source_key_id ?? null,
    authentication: input.authentication,
    evidence_grade: grade,
    grade_at_seal: grade,
    field_assertions: input.field_assertions ?? {},
    checks,
    limitations: PROVENANCE_LIMITATIONS,
    recorded_at: input.recorded_at,
  };
}

/** Source label for a caller that authenticated with an ingest key only. */
export function bearerSource(ingestKeyId?: string | null): {
  source_id: string;
  source_name: string;
} {
  return ingestKeyId
    ? {
        source_id: `ingest_key:${ingestKeyId}`,
        source_name: `Sender using ingest key ${ingestKeyId}`,
      }
    : { source_id: "unattributed", source_name: "Unattributed sender" };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Shape check only; consistency with the checks is `provenanceProblems`. */
export function isProvenanceBlock(v: unknown): v is ProvenanceBlock {
  if (!isRecord(v)) return false;
  if (typeof v.source_id !== "string" || !v.source_id) return false;
  if (typeof v.source_name !== "string") return false;
  if (
    !(PROVENANCE_AUTHENTICATIONS as readonly string[]).includes(
      String(v.authentication),
    )
  ) {
    return false;
  }
  if (!isEvidenceGrade(v.evidence_grade) || !isEvidenceGrade(v.grade_at_seal)) {
    return false;
  }
  if (typeof v.limitations !== "string") return false;
  if (typeof v.recorded_at !== "string") return false;
  if (!isRecord(v.checks)) return false;
  for (const id of PROVENANCE_CHECK_IDS) {
    if (typeof v.checks[id] !== "boolean") return false;
  }
  if (!isRecord(v.field_assertions)) return false;
  for (const how of Object.values(v.field_assertions)) {
    if (!(FIELD_ASSERTIONS as readonly string[]).includes(String(how))) {
      return false;
    }
  }
  return true;
}

/**
 * Reasons a block that IS present cannot be trusted as labelled. Empty = fine.
 * `hasEnvelope` says whether the receipt carries a source envelope for the claimed key.
 */
export function provenanceProblems(
  block: unknown,
  context: { hasEnvelope: boolean; envelopeSourceId?: string; envelopeKeyId?: string },
): string[] {
  if (!isProvenanceBlock(block)) {
    return ["The provenance block is incomplete or malformed."];
  }
  const problems: string[] = [];
  if (block.evidence_grade !== block.grade_at_seal) {
    problems.push("evidence_grade and grade_at_seal differ.");
  }
  if (block.evidence_grade !== gradeFromChecks(block.checks)) {
    problems.push("The grade does not follow from the checks.");
  }
  if (block.checks.source_signed && block.authentication !== "source_signature") {
    problems.push("source_signed is set without a source signature.");
  }
  if (block.authentication === "source_signature") {
    if (!context.hasEnvelope) {
      problems.push("Source signature is claimed but no signed envelope is attached.");
    } else {
      if (
        context.envelopeSourceId !== undefined &&
        context.envelopeSourceId !== block.source_id
      ) {
        problems.push("The envelope names a different source than the block.");
      }
      if (
        context.envelopeKeyId !== undefined &&
        block.source_key_id !== null &&
        context.envelopeKeyId !== block.source_key_id
      ) {
        problems.push("The envelope was signed with a different key than the block says.");
      }
    }
  }
  return problems;
}

/* ----------------------------- receipts → views ----------------------------- */

/** The slice of a signed receipt this module reads. */
export type ProvenanceReceiptLike = {
  receipt_id: string;
  seq: number;
  outcome: string;
  issued_at: string;
  provenance?: unknown;
  attributes?: Record<string, unknown>;
};

export const GRADE_CHANGE_OUTCOME = "grade_change";

export type GradeChangeRecord = {
  receipt_id: string;
  seq: number;
  at: string;
  from_grade: EvidenceGrade;
  to_grade: EvidenceGrade;
  reason: string;
  feed_name: string | null;
  checks: ProvenanceChecks;
};

/** Parse the grade_change facts sealed in a receipt, or null when this is not a valid one. */
export function gradeChangeFromReceipt(
  r: ProvenanceReceiptLike,
): GradeChangeRecord | null {
  if (r.outcome !== GRADE_CHANGE_OUTCOME) return null;
  const g = r.attributes?.grade_change;
  if (!isRecord(g)) return null;
  if (!isEvidenceGrade(g.from_grade) || !isEvidenceGrade(g.to_grade)) return null;
  return {
    receipt_id: r.receipt_id,
    seq: r.seq,
    at: r.issued_at,
    from_grade: g.from_grade,
    to_grade: g.to_grade,
    reason: typeof g.reason === "string" ? g.reason : "",
    feed_name: typeof g.feed_name === "string" && g.feed_name ? g.feed_name : null,
    checks: mergeChecks(isRecord(g.checks) ? (g.checks as Partial<ProvenanceChecks>) : null),
  };
}

export function gradeChangeProblems(r: ProvenanceReceiptLike): string[] {
  if (r.outcome !== GRADE_CHANGE_OUTCOME) return [];
  const c = gradeChangeFromReceipt(r);
  if (!c) return ["The grade change record is incomplete."];
  const problems: string[] = [];
  if (gradeRank(c.to_grade) <= gradeRank(c.from_grade)) {
    problems.push("A grade change must raise the grade.");
  }
  if (!c.reason.trim()) problems.push("A grade change must give a reason.");
  return problems;
}

function envelopeOf(r: ProvenanceReceiptLike): Record<string, unknown> | null {
  const e = r.attributes?.source_envelope;
  return isRecord(e) && typeof e.key_id === "string" && typeof e.signature === "string"
    ? e
    : null;
}

export type ReceiptProvenanceSummary = {
  /** False for receipts sealed before Stage 2. */
  has_block: boolean;
  legacy: boolean;
  grade_at_seal: EvidenceGrade | null;
  authentication: ProvenanceAuthentication | null;
  source_id: string | null;
  source_name: string | null;
  recorded_at: string | null;
};

export function summarizeReceiptProvenance(
  r: ProvenanceReceiptLike,
): ReceiptProvenanceSummary {
  if (r.outcome === GRADE_CHANGE_OUTCOME) {
    return {
      has_block: false,
      legacy: false,
      grade_at_seal: null,
      authentication: null,
      source_id: null,
      source_name: null,
      recorded_at: null,
    };
  }
  if (isProvenanceBlock(r.provenance)) {
    return {
      has_block: true,
      legacy: false,
      grade_at_seal: r.provenance.grade_at_seal,
      authentication: r.provenance.authentication,
      source_id: r.provenance.source_id,
      source_name: r.provenance.source_name,
      recorded_at: r.provenance.recorded_at,
    };
  }
  const env = envelopeOf(r);
  return {
    has_block: false,
    legacy: true,
    grade_at_seal: env ? "G1" : "G0",
    authentication: env ? "source_signature" : null,
    source_id: env && typeof env.source_id === "string" ? env.source_id : null,
    source_name: env && typeof env.source_id === "string" ? env.source_id : null,
    recorded_at: null,
  };
}

export type CaseProvenanceView = {
  schema_version: 1;
  /** True when the first data receipt has no provenance block (sealed before Stage 2). */
  legacy: boolean;
  source: {
    source_id: string;
    source_name: string;
    key_id: string | null;
    authentication: ProvenanceAuthentication;
  } | null;
  grade_at_seal: EvidenceGrade;
  current_grade: EvidenceGrade;
  grade_changes: GradeChangeRecord[];
  checks: ProvenanceChecks;
  /** The five facts, in the order the case page shows them. */
  checklist: Array<{ id: ProvenanceCheckId; label: string; met: boolean }>;
  field_assertions: Record<string, FieldAssertion>;
  limitations: string;
  recorded_at: string | null;
  /** "Data signed by X (key k). Aegis proves it was recorded at … (grade G1)." */
  headline: string;
  /** "Record intact: signed and unchanged since <time>" (shown only when the check passed). */
  record_line: string;
  /** "Source of the data: G1. Signed by X …" */
  source_line: string;
  /** Short chip text, e.g. "G1 · signed by X". */
  source_line_short: string;
};

export function formatUtcMinute(isoText: string | null | undefined): string {
  if (!isoText) return "an unknown time";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return isoText;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function gradeTag(seal: EvidenceGrade, current: EvidenceGrade, legacy: boolean): string {
  const base = current === seal ? `grade ${seal}` : `grade ${seal} at seal, now ${current}`;
  return legacy ? `${base}, legacy` : base;
}

type Wording = {
  headline: string;
  source_line: string;
  source_line_short: string;
};

export function describeProvenance(input: {
  legacy: boolean;
  source: CaseProvenanceView["source"];
  grade_at_seal: EvidenceGrade;
  current_grade: EvidenceGrade;
  recorded_at: string | null;
}): Wording {
  const when = formatUtcMinute(input.recorded_at);
  const tag = gradeTag(input.grade_at_seal, input.current_grade, input.legacy);
  const proves = `Aegis proves it was recorded at ${when} and has not changed since.`;
  const tail = `${proves} ${DOES_NOT_VERIFY_ACCURACY} (${tag}).`;
  const grade = input.current_grade;
  const s = input.source;

  if (input.legacy && !s) {
    return {
      headline:
        `This record was sealed before data sources were labelled, so who sent the data is not recorded. ${tail}`,
      source_line:
        `Source of the data: ${grade} (legacy). Sealed before sources were labelled; who sent the data is not recorded. ${DOES_NOT_VERIFY_ACCURACY}`,
      source_line_short: `${grade} · legacy, source not labelled`,
    };
  }
  const name = s?.source_name ?? "an unknown sender";
  const key = s?.key_id ? ` (key ${s.key_id})` : "";
  const how = s?.authentication ?? "bearer_key";

  let headline: string;
  let sourceLine: string;
  let short: string;
  if (how === "source_signature") {
    headline = `Data signed by ${name}${key}. ${tail}`;
    sourceLine = `signed by ${name}${key}.`;
    short = `signed by ${name}`;
  } else if (how === "mtls") {
    headline = `Data sent by ${name} over a mutually authenticated connection (mTLS); the source did not sign the data itself. ${tail}`;
    sourceLine = `sent by ${name} over a mutually authenticated connection; the source did not sign the data itself.`;
    short = `sent by ${name} (mTLS)`;
  } else {
    headline = `Data sent by ${name} with an ingest key; the sender did not sign it. ${tail}`;
    sourceLine = `sent by ${name} with an ingest key; the sender did not sign it.`;
    short = `asserted by ${name}`;
  }
  const extra =
    grade === "G3"
      ? " Also captured independently of the source."
      : grade === "G2"
        ? " Also corroborated by another record."
        : "";
  return {
    headline,
    source_line: `Source of the data: ${grade}. ${capitalize(sourceLine)}${extra} ${DOES_NOT_VERIFY_ACCURACY}`,
    source_line_short: `${grade} · ${short}`,
  };
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function recordLine(recordedAt: string | null): string {
  return `Record intact: signed and unchanged since ${formatUtcMinute(recordedAt)}`;
}

/**
 * The case-level provenance every surface shows. Pure: pass the case's signed receipts.
 * Returns null when there are none.
 */
export function buildCaseProvenance(
  receipts: ProvenanceReceiptLike[],
): CaseProvenanceView | null {
  const sorted = [...receipts].sort((a, b) => a.seq - b.seq);
  const changes = sorted
    .map(gradeChangeFromReceipt)
    .filter((c): c is GradeChangeRecord => c !== null);
  const data = sorted.filter((r) => r.outcome !== GRADE_CHANGE_OUTCOME);
  if (data.length === 0 && changes.length === 0) return null;

  const first = data[0];
  const firstBlock = first && isProvenanceBlock(first.provenance) ? first.provenance : null;
  const legacy = !firstBlock;
  const firstEnvelope = first && !firstBlock ? envelopeOf(first) : null;

  let source: CaseProvenanceView["source"] = null;
  let gradeAtSeal: EvidenceGrade = "G0";
  let recordedAt: string | null = first?.issued_at ?? changes[0]?.at ?? null;
  const dataChecks: Array<Partial<ProvenanceChecks>> = [];
  const assertions: Record<string, FieldAssertion> = {};
  let limitations = PROVENANCE_LIMITATIONS;

  if (firstBlock) {
    source = {
      source_id: firstBlock.source_id,
      source_name: firstBlock.source_name,
      key_id: firstBlock.source_key_id ?? null,
      authentication: firstBlock.authentication,
    };
    gradeAtSeal = firstBlock.grade_at_seal;
    recordedAt = firstBlock.recorded_at;
    limitations = firstBlock.limitations;
  } else if (firstEnvelope) {
    const sid =
      typeof firstEnvelope.source_id === "string" ? firstEnvelope.source_id : "unknown";
    source = {
      source_id: sid,
      source_name: sid,
      key_id: String(firstEnvelope.key_id),
      authentication: "source_signature",
    };
    gradeAtSeal = "G1";
    dataChecks.push({ source_signed: true });
  }

  let current = gradeAtSeal;
  for (const r of data) {
    if (isProvenanceBlock(r.provenance)) {
      dataChecks.push(r.provenance.checks);
      current = maxGrade(current, r.provenance.evidence_grade);
      for (const [k, v] of Object.entries(r.provenance.field_assertions)) {
        if (!(k in assertions)) assertions[k] = v;
      }
    }
  }
  for (const c of changes) {
    dataChecks.push(c.checks);
    current = maxGrade(current, c.to_grade);
  }
  const checks = mergeChecks(...dataChecks);

  const words = describeProvenance({
    legacy,
    source,
    grade_at_seal: gradeAtSeal,
    current_grade: current,
    recorded_at: recordedAt,
  });
  return {
    schema_version: 1,
    legacy,
    source,
    grade_at_seal: gradeAtSeal,
    current_grade: current,
    grade_changes: changes,
    checks,
    checklist: PROVENANCE_CHECK_IDS.map((id) => ({
      id,
      label: PROVENANCE_CHECK_LABELS[id],
      met: checks[id],
    })),
    field_assertions: assertions,
    limitations,
    recorded_at: recordedAt,
    headline: words.headline,
    record_line: recordLine(recordedAt),
    source_line: words.source_line,
    source_line_short: words.source_line_short,
  };
}
