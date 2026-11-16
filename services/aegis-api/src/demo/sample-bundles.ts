/**
 * Demo-only sample evidence bundles for the public Verify page:
 * the latest real Demo Bank bundle, plus a copy with one RWF amount digit
 * changed after signing. Served only when demo mode is on (see public routes).
 */

import type pg from "pg";
import {
  loadEvidenceBundle,
  trustedReceiptKeysFromEnv,
  verifyBundleFile,
  type EvidenceBundle,
} from "../forensic/evidence-bundle.js";

export type TamperDescription = {
  field: "amount";
  receipt_id: string;
  currency: string | null;
  original: number;
  altered: number;
  /** Plain sentence the Verify page shows next to the failed check. */
  summary: string;
};

const AMOUNT_KEYS = ["amount", "amount_rwf", "loan_amount"] as const;

function amountKey(attrs: Record<string, unknown> | undefined): (typeof AMOUNT_KEYS)[number] | null {
  if (!attrs) return null;
  for (const k of AMOUNT_KEYS) {
    const v = attrs[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return k;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0) {
      return k;
    }
  }
  return null;
}

/** Change the leading digit by one (never to 0): 5,000,000 -> 6,000,000. */
export function alterOneDigit(amount: number): number {
  const digits = String(Math.round(Math.abs(amount)));
  const lead = Number(digits[0]);
  const next = lead >= 9 ? 8 : lead + 1;
  return Number(`${next}${digits.slice(1)}`);
}

function fmt(n: number, currency: string | null): string {
  return `${currency ?? "RWF"} ${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * Deep copy of the bundle with one amount digit changed inside a signed receipt.
 * Nothing is re-signed, so verification must fail. Returns null when the bundle
 * has no amount to alter.
 */
export function tamperBundleAmount(
  bundle: EvidenceBundle,
): { bundle: EvidenceBundle; tamper: TamperDescription } | null {
  const copy = structuredClone(bundle);
  for (const receipt of copy.receipts) {
    const attrs = receipt.attributes as Record<string, unknown> | undefined;
    const key = amountKey(attrs);
    if (!attrs || !key) continue;
    const raw = attrs[key];
    const original = Number(raw);
    const altered = alterOneDigit(original);
    attrs[key] = typeof raw === "string" ? String(altered) : altered;
    const currency = typeof attrs.currency === "string" ? attrs.currency : null;
    return {
      bundle: copy,
      tamper: {
        field: "amount",
        receipt_id: receipt.receipt_id,
        currency,
        original,
        altered,
        summary: `One digit of the amount was changed after signing (${fmt(original, currency)} became ${fmt(altered, currency)}).`,
      },
    };
  }
  return null;
}

export type DemoSampleBundles = {
  organization_slug: string;
  case_id: string | null;
  trace_id: string;
  valid: EvidenceBundle;
  tampered: EvidenceBundle;
  tamper: TamperDescription;
};

/**
 * Latest Demo Bank case with a signed receipt that has an amount and verifies.
 * Returns null when the org has none yet (run the demo seed first).
 */
export async function loadDemoSampleBundles(
  client: pg.Pool | pg.PoolClient,
  slug: string,
): Promise<DemoSampleBundles | null> {
  const org = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1`,
    [slug],
  );
  const organizationId = org.rows[0]?.organization_id;
  if (!organizationId) return null;

  const cases = await client.query<{ trace_id: string }>(
    `SELECT trace_id FROM bank_case
     WHERE organization_id = $1 AND trace_id IS NOT NULL AND receipt_id IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 25`,
    [organizationId],
  );

  for (const row of cases.rows) {
    const bundle = await loadEvidenceBundle(client, organizationId, row.trace_id);
    if (!bundle) continue;
    const altered = tamperBundleAmount(bundle);
    if (!altered) continue;
    // Only offer a sample that really verifies, so "valid" is honest.
    const check = await verifyBundleFile(bundle, {
      trustedKeys: await trustedReceiptKeysFromEnv(),
    });
    if (!check.ok) continue;
    return {
      organization_slug: slug,
      case_id: bundle.case_id,
      trace_id: bundle.trace_id,
      valid: bundle,
      tampered: altered.bundle,
      tamper: altered.tamper,
    };
  }
  return null;
}
