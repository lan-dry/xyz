/**
 * Derive governance attributes Aegis computes from sealed history + clock,
 * before bank rule evaluation. Banks already have limits/fraud/ML; these
 * attrs let Aegis govern around signals they assert.
 */

import type pg from "pg";
import {
  beneficiaryKeyFromAttributes,
  customerKeyFromAttributes,
  formatRwf,
  hasSeenBeneficiary,
  queryCustomerVelocity,
  type CustomerVelocity,
} from "./velocity.js";

export type SegmentProductLimit = {
  segment: string;
  product: string;
  /** Display name, e.g. "Retail Standard" */
  label: string;
  window_hours: number;
  max_amount?: number;
  max_count?: number;
};

export type DeriveGovernanceInput = {
  organizationId: string;
  attributes: Record<string, unknown>;
  product?: string | null;
  /** Event emit time (ISO); defaults to now. */
  emittedAt?: string | null;
  segmentLimits?: SegmentProductLimit[];
  /** True when model.score came from a signed third-party model fact. */
  modelScoreSignedByModelService?: boolean;
  timezone?: string;
};

export type DeriveGovernanceResult = {
  /** Flat + nested attrs merged into evaluate/seal bags. */
  derived: Record<string, unknown>;
  velocity: CustomerVelocity | null;
  hold_plain_english: string | null;
};

const DEFAULT_SEGMENT_LIMITS: SegmentProductLimit[] = [
  {
    segment: "retail_standard",
    product: "payment_transfer",
    label: "Retail Standard",
    window_hours: 24,
    max_amount: 8_000_000,
    max_count: 10,
  },
  {
    segment: "retail_standard",
    product: "retail_loan",
    label: "Retail Standard",
    window_hours: 24,
    max_amount: 25_000_000,
    max_count: 5,
  },
  {
    segment: "private_banking",
    product: "payment_transfer",
    label: "Private Banking",
    window_hours: 24,
    max_amount: 50_000_000,
    max_count: 40,
  },
];

export function defaultSegmentProductLimits(): SegmentProductLimit[] {
  return DEFAULT_SEGMENT_LIMITS.map((l) => ({ ...l }));
}

function readAmount(attrs: Record<string, unknown>): number {
  const raw = attrs.amount ?? attrs.amount_rwf ?? attrs.loan_amount;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function readSegment(attrs: Record<string, unknown>): string {
  const raw =
    attrs.segment ??
    attrs.customer_segment ??
    attrs.client_segment ??
    attrs.tier;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().toLowerCase().replace(/\s+/g, "_");
  }
  return "retail_standard";
}

function readChannel(attrs: Record<string, unknown>): string {
  const raw = attrs.channel ?? attrs.source_channel ?? attrs.delivery_channel;
  if (typeof raw === "string" && raw.trim()) return raw.trim().toLowerCase();
  return "unknown";
}

/** Africa/Kigali business hours: weekdays 08:00–18:00. */
export function classifyTimeOfDay(
  when: Date,
  timeZone = "Africa/Kigali",
): "business_hours" | "off_hours" {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(when);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  if (isWeekend) return "off_hours";
  if (hour >= 8 && hour < 18) return "business_hours";
  return "off_hours";
}

function matchLimit(
  limits: SegmentProductLimit[],
  segment: string,
  product: string,
): SegmentProductLimit | null {
  return (
    limits.find(
      (l) =>
        l.segment.toLowerCase() === segment &&
        l.product.toLowerCase() === product.toLowerCase(),
    ) ?? null
  );
}

function buildVelocityHoldEnglish(input: {
  projectedCount: number;
  projectedAmount: number;
  limit: SegmentProductLimit;
}): string {
  const ordinal =
    input.projectedCount === 1
      ? "1st"
      : input.projectedCount === 2
        ? "2nd"
        : input.projectedCount === 3
          ? "3rd"
          : `${input.projectedCount}th`;
  const parts: string[] = [
    `Held: ${ordinal} transfer today`,
  ];
  if (
    input.limit.max_amount != null &&
    input.projectedAmount > input.limit.max_amount
  ) {
    parts.push(
      `day's total ${formatRwf(input.projectedAmount)} exceeds the ${input.limit.label} daily limit of ${formatRwf(input.limit.max_amount)}`,
    );
  } else if (
    input.limit.max_count != null &&
    input.projectedCount > input.limit.max_count
  ) {
    parts.push(
      `day's count ${input.projectedCount} exceeds the ${input.limit.label} daily count limit of ${input.limit.max_count}`,
    );
  }
  parts.push("(counts only activity reported to Aegis)");
  return parts.join("; ").replace("; (", " (");
}

/**
 * Load segment×product limits from org governance_settings, else defaults.
 */
export async function loadSegmentProductLimits(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<SegmentProductLimit[]> {
  const result = await client.query<{ limits: unknown }>(
    `SELECT governance_settings->'segment_product_limits' AS limits
     FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  const raw = result.rows[0]?.limits;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter(
      (x): x is SegmentProductLimit =>
        !!x &&
        typeof x === "object" &&
        typeof (x as SegmentProductLimit).segment === "string" &&
        typeof (x as SegmentProductLimit).product === "string",
    );
  }
  return defaultSegmentProductLimits();
}

export async function deriveGovernanceAttributes(
  client: pg.Pool | pg.PoolClient,
  input: DeriveGovernanceInput,
): Promise<DeriveGovernanceResult> {
  const attrs = input.attributes;
  const asOf = input.emittedAt ? new Date(input.emittedAt) : new Date();
  const customerKey = customerKeyFromAttributes(attrs);
  const beneficiaryKey = beneficiaryKeyFromAttributes(attrs);
  const segment = readSegment(attrs);
  const product =
    (typeof input.product === "string" && input.product) ||
    (typeof attrs.product === "string" ? attrs.product : "payment_transfer");
  const channel = readChannel(attrs);
  const amount = readAmount(attrs);
  const timeOfDay =
    attrs.force_off_hours === true
      ? "off_hours"
      : attrs.force_business_hours === true
        ? "business_hours"
        : classifyTimeOfDay(asOf, input.timezone ?? "Africa/Kigali");
  const country =
    typeof attrs.beneficiary_country === "string"
      ? attrs.beneficiary_country
      : typeof attrs.country === "string"
        ? attrs.country
        : null;

  let velocity: CustomerVelocity | null = null;
  let newBeneficiary = false;
  if (customerKey) {
    velocity = await queryCustomerVelocity(
      client,
      input.organizationId,
      customerKey,
      { asOf },
    );
    if (beneficiaryKey) {
      const seen = await hasSeenBeneficiary(
        client,
        input.organizationId,
        customerKey,
        beneficiaryKey,
        { asOf },
      );
      newBeneficiary = !seen;
    }
  }

  const limits = input.segmentLimits ?? (await loadSegmentProductLimits(
    client,
    input.organizationId,
  ));
  const limit = matchLimit(limits, segment, product);

  const prior24 = velocity?.windows["24h"];
  const projectedDailyAmount = (prior24?.amount ?? 0) + amount;
  const projectedDailyCount = (prior24?.count ?? 0) + 1;
  const exceedsAmount =
    limit?.max_amount != null && projectedDailyAmount > limit.max_amount;
  const exceedsCount =
    limit?.max_count != null && projectedDailyCount > limit.max_count;

  const modelScoreSigned = input.modelScoreSignedByModelService === true;
  const modelScoreLabel = modelScoreSigned
    ? "signed by model service"
    : "asserted by source";

  const model = attrs.model;
  const modelObj =
    model && typeof model === "object" && !Array.isArray(model)
      ? (model as Record<string, unknown>)
      : null;
  const rawScore = modelObj?.score ?? attrs["model.score"];
  const modelScore =
    typeof rawScore === "number" && Number.isFinite(rawScore)
      ? rawScore
      : typeof rawScore === "string" && rawScore.trim() !== ""
        ? Number(rawScore)
        : null;
  const modelScoreOk =
    typeof modelScore === "number" && Number.isFinite(modelScore)
      ? modelScore
      : null;
  const modelVersion =
    typeof modelObj?.version === "string"
      ? modelObj.version
      : typeof attrs["model.version"] === "string"
        ? (attrs["model.version"] as string)
        : null;

  // Prefer fraud-block wording over velocity when both could apply (stop > hold).
  let holdPlain: string | null = null;
  if (
    segment === "retail_standard" &&
    modelScoreOk != null &&
    modelScoreOk >= 0.9
  ) {
    holdPlain =
      `Stopped: fraud model score ${modelScoreOk.toFixed(2)} ` +
      `(version ${modelVersion ?? "unknown"}, ${modelScoreLabel}) ` +
      `meets or exceeds the Retail Standard block threshold of 0.90`;
  } else if (limit && (exceedsAmount || exceedsCount)) {
    holdPlain = buildVelocityHoldEnglish({
      projectedCount: projectedDailyCount,
      projectedAmount: projectedDailyAmount,
      limit,
    });
  } else if (
    newBeneficiary &&
    amount >= 5_000_000 &&
    timeOfDay === "off_hours"
  ) {
    holdPlain =
      `Held: first transfer to this beneficiary for the customer, ` +
      `${formatRwf(amount)}, outside business hours (${timeOfDay})`;
  }

  const aegis = {
    counts_only_activity_reported_to_aegis: true as const,
    customer_key: customerKey,
    new_beneficiary: newBeneficiary,
    beneficiary_country: country,
    channel,
    time_of_day: timeOfDay,
    segment,
    product,
    segment_limit_name: limit?.label ?? null,
    segment_daily_limit_rwf: limit?.max_amount ?? null,
    segment_daily_count_limit: limit?.max_count ?? null,
    projected_daily_amount: projectedDailyAmount,
    projected_daily_count: projectedDailyCount,
    exceeds_segment_daily_amount: exceedsAmount,
    exceeds_segment_daily_count: exceedsCount,
    model_score_label: modelScoreLabel,
    hold_plain_english: holdPlain,
    velocity: velocity
      ? {
          count_1h: velocity.windows["1h"].count,
          amount_1h: velocity.windows["1h"].amount,
          count_24h: velocity.windows["24h"].count,
          amount_24h: velocity.windows["24h"].amount,
          count_7d: velocity.windows["7d"].count,
          amount_7d: velocity.windows["7d"].amount,
          query_ms: {
            "1h": velocity.windows["1h"].query_ms,
            "24h": velocity.windows["24h"].query_ms,
            "7d": velocity.windows["7d"].query_ms,
          },
        }
      : null,
  };

  // Flat paths for Expr (getPath supports dotted keys via nested objects).
  const derived: Record<string, unknown> = {
    aegis,
    // Convenience top-level mirrors used by pack Expr paths
    new_beneficiary: newBeneficiary,
    beneficiary_country: country,
    channel,
    time_of_day: timeOfDay,
    segment,
  };

  return {
    derived,
    velocity,
    hold_plain_english: holdPlain,
  };
}
