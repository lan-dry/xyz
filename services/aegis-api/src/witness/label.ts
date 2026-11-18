/**
 * Honest product wording for Merkle witness checkpoints.
 * Internal / Salanor-signed roots must not be described as an outside witness.
 */

export function witnessCheckpointLabel(
  anchoringType: string | null | undefined,
): string {
  const anchor = (anchoringType ?? "internal").trim().toLowerCase();
  if (anchor && anchor !== "internal") {
    return `Externally anchored witness checkpoint (${anchor})`;
  }
  return "Salanor witness checkpoint (signed)";
}

export function isExternallyAnchored(
  anchoringType: string | null | undefined,
): boolean {
  const anchor = (anchoringType ?? "internal").trim().toLowerCase();
  return Boolean(anchor && anchor !== "internal");
}
