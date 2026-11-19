import { jcs, sha256Hex } from "@salanor/aegis-sdk";

/**
 * Normalize a ledger amount so CDC hashes match confirm params.
 * Confirm uses String(Number(...)) → "18000000"; PG NUMERIC often yields "18000000.00".
 */
export function normalizeAmount(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value).trim();
  if (!s) return "";
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(n);
  }
  return s;
}

/**
 * Executable match fields from a CDC row (amount / currency / beneficiary).
 * Maps bank_transaction.account_id → beneficiary_account.
 * Returns null when the row has none of those fields (caller may hash the whole row).
 */
export function matchValuesFromRow(
  row: Record<string, unknown> | null,
): { amount: string; currency: string; beneficiary_account: string } | null {
  if (row == null) return null;
  const hasAmount = "amount" in row;
  const hasCurrency = "currency" in row;
  const hasBeneficiary =
    "beneficiary_account" in row || "account_id" in row || "beneficiary" in row;
  if (!hasAmount && !hasCurrency && !hasBeneficiary) return null;
  const beneficiary =
    row.beneficiary_account ?? row.account_id ?? row.beneficiary ?? "";
  return {
    amount: normalizeAmount(row.amount),
    currency: String(row.currency ?? ""),
    beneficiary_account: String(beneficiary ?? ""),
  };
}

/**
 * sha256 hex of JCS(match values). Prefer amount/currency/beneficiary when present
 * so reconciliation can compare against confirmed executable params.
 * Empty string when values are null (delete/truncate).
 */
export function hashNewValues(
  newValues: Record<string, unknown> | null,
): string {
  if (newValues == null) return "";
  const match = matchValuesFromRow(newValues);
  if (match) return sha256Hex(jcs(match));
  return sha256Hex(jcs(newValues));
}

/** Stable idempotency material for a change (not a UUID — hashed into one). */
export function changeFingerprint(input: {
  schema: string;
  table: string;
  operation: string;
  row_key: Record<string, string>;
  new_values_hash: string;
  lsn: string;
}): string {
  return sha256Hex(
    jcs({
      schema: input.schema,
      table: input.table,
      operation: input.operation,
      row_key: input.row_key,
      new_values_hash: input.new_values_hash,
      lsn: input.lsn,
    }),
  );
}
