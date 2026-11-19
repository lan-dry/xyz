/**
 * Cumulative amount + count per customer over rolling windows, from sealed
 * Aegis events only. Always label results as counting only activity reported
 * to Aegis — not the bank's full ledger.
 */

import type pg from "pg";

export const VELOCITY_WINDOWS_HOURS = [1, 24, 168] as const;
export type VelocityWindowHours = (typeof VELOCITY_WINDOWS_HOURS)[number];

export type VelocityWindowStat = {
  window_hours: VelocityWindowHours;
  count: number;
  amount: number;
  /** Wall-clock ms for this query (for tests / timing index; not a claim). */
  query_ms: number;
};

export type CustomerVelocity = {
  customer_key: string;
  counts_only_activity_reported_to_aegis: true;
  windows: Record<"1h" | "24h" | "7d", VelocityWindowStat>;
};

/** Stable customer key for velocity / beneficiary history. */
export function customerKeyFromAttributes(
  attrs: Record<string, unknown>,
): string | null {
  const keys = [
    "customer_id",
    "applicant_id",
    "account_id",
    "from_account",
    "sender_account",
  ];
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function beneficiaryKeyFromAttributes(
  attrs: Record<string, unknown>,
): string | null {
  const keys = [
    "beneficiary_account",
    "beneficiary",
    "beneficiary_id",
    "to_account",
  ];
  for (const k of keys) {
    const v = attrs[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function amountFromPayloadAttrs(attrs: unknown): number {
  if (!attrs || typeof attrs !== "object") return 0;
  const a = attrs as Record<string, unknown>;
  const raw = a.amount ?? a.amount_rwf ?? a.loan_amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const WINDOW_LABEL: Record<VelocityWindowHours, "1h" | "24h" | "7d"> = {
  1: "1h",
  24: "24h",
  168: "7d",
};

/**
 * Sum count + amount for one customer across all sealed events in the org
 * (all channels/sources) inside the rolling window ending at `asOf`.
 */
export async function queryCustomerVelocityWindow(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  customerKey: string,
  windowHours: VelocityWindowHours,
  options?: {
    asOf?: Date;
    /** Exclude this event_id (current in-flight seal). */
    excludeEventId?: string | null;
  },
): Promise<VelocityWindowStat> {
  const asOf = options?.asOf ?? new Date();
  const started = performance.now();
  const result = await client.query<{
    cnt: string;
    amt: string;
  }>(
    `SELECT COUNT(*)::text AS cnt,
            COALESCE(SUM(
              COALESCE(
                NULLIF(payload->'attributes'->>'amount', '')::numeric,
                NULLIF(payload->'attributes'->>'amount_rwf', '')::numeric,
                NULLIF(payload->'attributes'->>'loan_amount', '')::numeric,
                0
              )
            ), 0)::text AS amt
     FROM event
     WHERE organization_id = $1
       AND purged_at IS NULL
       AND emitted_at >= $2::timestamptz - ($3::int * interval '1 hour')
       AND emitted_at < $2::timestamptz
       AND ($4::text IS NULL OR event_id <> $4)
       AND COALESCE(
             payload->'attributes'->>'customer_id',
             payload->'attributes'->>'applicant_id',
             payload->'attributes'->>'account_id',
             payload->'attributes'->>'from_account',
             payload->'attributes'->>'sender_account'
           ) = $5`,
    [
      organizationId,
      asOf.toISOString(),
      windowHours,
      options?.excludeEventId ?? null,
      customerKey,
    ],
  );
  const query_ms = Math.round(performance.now() - started);
  const row = result.rows[0];
  return {
    window_hours: windowHours,
    count: Number(row?.cnt ?? 0) || 0,
    amount: Number(row?.amt ?? 0) || 0,
    query_ms,
  };
}

export async function queryCustomerVelocity(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  customerKey: string,
  options?: {
    asOf?: Date;
    excludeEventId?: string | null;
  },
): Promise<CustomerVelocity> {
  const windows = {} as CustomerVelocity["windows"];
  for (const hours of VELOCITY_WINDOWS_HOURS) {
    const stat = await queryCustomerVelocityWindow(
      client,
      organizationId,
      customerKey,
      hours,
      options,
    );
    windows[WINDOW_LABEL[hours]] = stat;
  }
  return {
    customer_key: customerKey,
    counts_only_activity_reported_to_aegis: true,
    windows,
  };
}

/** Has this customer sent to this beneficiary in any prior sealed event? */
export async function hasSeenBeneficiary(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  customerKey: string,
  beneficiaryKey: string,
  options?: { asOf?: Date; excludeEventId?: string | null },
): Promise<boolean> {
  const asOf = options?.asOf ?? new Date();
  const result = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM event
       WHERE organization_id = $1
         AND purged_at IS NULL
         AND emitted_at < $2::timestamptz
         AND ($3::text IS NULL OR event_id <> $3)
         AND COALESCE(
               payload->'attributes'->>'customer_id',
               payload->'attributes'->>'applicant_id',
               payload->'attributes'->>'account_id',
               payload->'attributes'->>'from_account',
               payload->'attributes'->>'sender_account'
             ) = $4
         AND COALESCE(
               payload->'attributes'->>'beneficiary_account',
               payload->'attributes'->>'beneficiary',
               payload->'attributes'->>'beneficiary_id',
               payload->'attributes'->>'to_account'
             ) = $5
     ) AS ok`,
    [
      organizationId,
      asOf.toISOString(),
      options?.excludeEventId ?? null,
      customerKey,
      beneficiaryKey,
    ],
  );
  return Boolean(result.rows[0]?.ok);
}

/** Channel split helper for boundary tests. */
export async function queryCustomerVelocityByChannel(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  customerKey: string,
  windowHours: VelocityWindowHours,
  options?: { asOf?: Date },
): Promise<Array<{ channel: string; count: number; amount: number }>> {
  const asOf = options?.asOf ?? new Date();
  const result = await client.query<{
    channel: string;
    cnt: string;
    amt: string;
  }>(
    `SELECT COALESCE(payload->'attributes'->>'channel', 'unknown') AS channel,
            COUNT(*)::text AS cnt,
            COALESCE(SUM(
              COALESCE(
                NULLIF(payload->'attributes'->>'amount', '')::numeric,
                NULLIF(payload->'attributes'->>'amount_rwf', '')::numeric,
                0
              )
            ), 0)::text AS amt
     FROM event
     WHERE organization_id = $1
       AND purged_at IS NULL
       AND emitted_at >= $2::timestamptz - ($3::int * interval '1 hour')
       AND emitted_at < $2::timestamptz
       AND COALESCE(
             payload->'attributes'->>'customer_id',
             payload->'attributes'->>'applicant_id',
             payload->'attributes'->>'account_id',
             payload->'attributes'->>'from_account',
             payload->'attributes'->>'sender_account'
           ) = $4
     GROUP BY 1
     ORDER BY 1`,
    [organizationId, asOf.toISOString(), windowHours, customerKey],
  );
  return result.rows.map((r) => ({
    channel: r.channel,
    count: Number(r.cnt) || 0,
    amount: Number(r.amt) || 0,
  }));
}

export function formatRwf(amount: number): string {
  return `RWF ${Math.round(amount).toLocaleString("en-GB")}`;
}

/** Used by unit tests that inject rows without a full seal. */
export function sumAmountsFromAttrList(
  rows: Array<Record<string, unknown>>,
): number {
  return rows.reduce((s, r) => s + amountFromPayloadAttrs(r), 0);
}
