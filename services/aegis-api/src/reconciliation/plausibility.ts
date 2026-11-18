/**
 * Stage 7: non-blocking plausibility flags.
 *
 * Flags never change the policy outcome. They are raised as `plausibility_flag`
 * exceptions and sealed onto the receipt so the case page can show them.
 */
import type pg from "pg";
import { upsertException } from "./exceptions.js";

export type PlausibilityKind =
  | "amount_outlier"
  | "outside_business_hours"
  | "schema_drift"
  | "sudden_volume_change";

export type PlausibilityFlag = {
  kind: PlausibilityKind;
  title: string;
  detail: Record<string, unknown>;
};

export type PlausibilityInput = {
  organization_id: string;
  case_id: string;
  source_id: string | null;
  source_name: string | null;
  attributes: Record<string, unknown>;
  emitted_at: string;
  /** Optional run id when raised from reconciliation. */
  run_id?: string | null;
  now?: Date;
  /** Injected history for unit tests (skip DB). */
  history?: {
    amounts?: number[];
    attribute_keys?: string[][];
    recent_event_count?: number;
    window_hours?: number;
  };
};

const BUSINESS_START_UTC = 7; // 07:00 UTC
const BUSINESS_END_UTC = 18; // 18:00 UTC exclusive
const OUTLIER_Z = 3;
const VOLUME_MULTIPLIER = 5;
const VOLUME_WINDOW_HOURS = 1;
const VOLUME_BASELINE_HOURS = 24;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readAmount(attributes: Record<string, unknown>): number | null {
  const raw = attributes.amount ?? attributes.amount_rwf ?? attributes.loan_amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

export function isOutsideBusinessHours(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return true;
  const hour = d.getUTCHours();
  return hour < BUSINESS_START_UTC || hour >= BUSINESS_END_UTC;
}

export function detectAmountOutlier(
  amount: number,
  history: number[],
): PlausibilityFlag | null {
  if (history.length < 5) return null;
  const m = mean(history);
  const s = stddev(history, m);
  if (s <= 0) {
    if (amount === m) return null;
    return {
      kind: "amount_outlier",
      title: "Amount differs from every prior amount for this source",
      detail: { amount, mean: m, sample_size: history.length },
    };
  }
  const z = Math.abs(amount - m) / s;
  if (z < OUTLIER_Z) return null;
  return {
    kind: "amount_outlier",
    title: "Amount is an outlier against this source's history",
    detail: { amount, mean: m, stddev: s, z_score: Number(z.toFixed(2)), sample_size: history.length },
  };
}

export function detectSchemaDrift(
  keys: string[],
  priorKeySets: string[][],
): PlausibilityFlag | null {
  if (priorKeySets.length < 3) return null;
  const expected = new Set<string>();
  for (const set of priorKeySets) for (const k of set) expected.add(k);
  const novel = keys.filter((k) => !expected.has(k) && !k.startsWith("_"));
  // Ignore bookkeeping / stage metadata that may appear later.
  const ignore = new Set([
    "third_party_facts",
    "signed_facts",
    "bureau_response",
    "input_commitments",
    "source_envelope",
    "third_party_signed",
    "plausibility_flags",
  ]);
  const unexpected = novel.filter((k) => !ignore.has(k));
  if (unexpected.length === 0) return null;
  return {
    kind: "schema_drift",
    title: "Event attributes include fields not seen from this source before",
    detail: { unexpected_fields: unexpected, prior_event_count: priorKeySets.length },
  };
}

export function detectSuddenVolumeChange(
  recentCount: number,
  baselineCount: number,
  windowHours: number,
  baselineHours: number,
): PlausibilityFlag | null {
  const baselineRate = baselineCount / Math.max(baselineHours, 1);
  const expectedInWindow = baselineRate * windowHours;
  if (expectedInWindow < 1) {
    // Quiet source: a burst of several events still flags.
    if (recentCount < 5) return null;
  } else if (recentCount < expectedInWindow * VOLUME_MULTIPLIER) {
    return null;
  } else if (recentCount < 3) {
    return null;
  }
  return {
    kind: "sudden_volume_change",
    title: "Sudden change in event volume from this source",
    detail: {
      recent_count: recentCount,
      window_hours: windowHours,
      baseline_count: baselineCount,
      baseline_hours: baselineHours,
      expected_in_window: Number(expectedInWindow.toFixed(2)),
    },
  };
}

async function loadHistory(
  db: pg.Pool | pg.PoolClient,
  organizationId: string,
  sourceId: string | null,
  now: Date,
): Promise<{
  amounts: number[];
  attribute_keys: string[][];
  recent_event_count: number;
  baseline_event_count: number;
}> {
  if (!sourceId) {
    return {
      amounts: [],
      attribute_keys: [],
      recent_event_count: 0,
      baseline_event_count: 0,
    };
  }
  const recentSince = new Date(now.getTime() - VOLUME_WINDOW_HOURS * 3600_000);
  const baselineSince = new Date(now.getTime() - VOLUME_BASELINE_HOURS * 3600_000);

  const rows = await db.query<{ attributes: Record<string, unknown> | null }>(
    `SELECT attributes
       FROM bank_case
      WHERE organization_id = $1
        AND attributes->>'source_id' = $2
      ORDER BY created_at DESC
      LIMIT 50`,
    [organizationId, sourceId],
  );

  const amounts: number[] = [];
  const attribute_keys: string[][] = [];
  for (const r of rows.rows) {
    const a = r.attributes ?? {};
    const amt = readAmount(a);
    if (amt != null) amounts.push(amt);
    attribute_keys.push(Object.keys(a).sort());
  }

  const recent = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM bank_case
      WHERE organization_id = $1
        AND attributes->>'source_id' = $2
        AND created_at >= $3::timestamptz`,
    [organizationId, sourceId, recentSince.toISOString()],
  );
  const baseline = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM bank_case
      WHERE organization_id = $1
        AND attributes->>'source_id' = $2
        AND created_at >= $3::timestamptz
        AND created_at < $4::timestamptz`,
    [organizationId, sourceId, baselineSince.toISOString(), recentSince.toISOString()],
  );

  return {
    amounts,
    attribute_keys,
    recent_event_count: Number(recent.rows[0]?.n ?? 0),
    baseline_event_count: Number(baseline.rows[0]?.n ?? 0),
  };
}

/** Pure detection given history; used by tests and the live path. */
export function evaluatePlausibility(input: {
  attributes: Record<string, unknown>;
  emitted_at: string;
  amounts: number[];
  attribute_keys: string[][];
  recent_event_count: number;
  baseline_event_count: number;
}): PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = [];
  const amount = readAmount(input.attributes);
  if (amount != null) {
    const outlier = detectAmountOutlier(amount, input.amounts);
    if (outlier) flags.push(outlier);
  }
  if (isOutsideBusinessHours(input.emitted_at)) {
    flags.push({
      kind: "outside_business_hours",
      title: "Event arrived outside business hours (UTC weekdays 07:00–18:00)",
      detail: { emitted_at: input.emitted_at },
    });
  }
  const drift = detectSchemaDrift(Object.keys(input.attributes).sort(), input.attribute_keys);
  if (drift) flags.push(drift);
  const volume = detectSuddenVolumeChange(
    input.recent_event_count,
    input.baseline_event_count,
    VOLUME_WINDOW_HOURS,
    VOLUME_BASELINE_HOURS,
  );
  if (volume) flags.push(volume);
  return flags;
}

/**
 * Detect plausibility flags and raise non-blocking exceptions. Never throws on
 * detector failure — returns [] so ingest can continue.
 */
export async function raisePlausibilityFlags(
  db: pg.Pool | pg.PoolClient,
  input: PlausibilityInput,
): Promise<PlausibilityFlag[]> {
  try {
    const now = input.now ?? new Date();
    let amounts = input.history?.amounts ?? [];
    let attribute_keys = input.history?.attribute_keys ?? [];
    let recent_event_count = input.history?.recent_event_count ?? 0;
    let baseline_event_count = 0;

    if (!input.history) {
      const hist = await loadHistory(db, input.organization_id, input.source_id, now);
      amounts = hist.amounts;
      attribute_keys = hist.attribute_keys;
      recent_event_count = hist.recent_event_count;
      baseline_event_count = hist.baseline_event_count;
    }

    const flags = evaluatePlausibility({
      attributes: input.attributes,
      emitted_at: input.emitted_at,
      amounts,
      attribute_keys,
      recent_event_count,
      baseline_event_count,
    });

    for (const flag of flags) {
      await upsertException(db, {
        organization_id: input.organization_id,
        kind: "plausibility_flag",
        run_id: input.run_id ?? null,
        case_id: input.case_id,
        source_name: input.source_name,
        fingerprint_key: flag.kind,
        title: flag.title,
        detail: {
          plausibility_kind: flag.kind,
          non_blocking: true,
          ...flag.detail,
        },
      });
    }
    return flags;
  } catch (err) {
    console.error(
      "[plausibility] detector failed (non-blocking)",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
