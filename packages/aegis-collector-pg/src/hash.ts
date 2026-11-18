import { jcs, sha256Hex } from "@salanor/aegis-sdk";

/** sha256 hex of JCS(new_values). Empty string when values are null (delete/truncate). */
export function hashNewValues(
  newValues: Record<string, unknown> | null,
): string {
  if (newValues == null) return "";
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
