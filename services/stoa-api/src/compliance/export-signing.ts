import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type SignedExportManifest = {
  version: 1;
  exportedAt: string;
  tenantId: string;
  eventCount: number;
  from: string | null;
  to: string | null;
  contentSha256: string;
};

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

export function signExportBundle(
  secret: string,
  manifest: SignedExportManifest,
): string {
  const canonical = JSON.stringify(manifest);
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

export function resolveExportSigningSecret(
  tenantSecret: string | null | undefined,
): string | null {
  const fromTenant = tenantSecret?.trim();
  if (fromTenant) {
    return fromTenant;
  }
  const fromEnv = process.env.STOA_EXPORT_SIGNING_SECRET?.trim();
  return fromEnv || null;
}

export function verifyExportSignature(
  secret: string,
  manifest: SignedExportManifest,
  signatureHex: string,
): boolean {
  const expected = signExportBundle(secret, manifest);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
