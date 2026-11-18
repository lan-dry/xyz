/**
 * Resolves how forensic receipts are signed.
 *
 *  Plan A  AEGIS_RECEIPT_KMS_KEY_ID set  -> AWS KMS Ed25519 (custody "kms").
 *  Plan B  software seed (AEGIS_RECEIPT_SIGNING_KEY_B64)
 *            - non-production: allowed (custody "software", dev/test)
 *            - production: only with AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim
 *              (custody "software_interim"; receipts and Verify say so)
 *
 * Production never signs with a dev key id or an un-flagged software key, even
 * if the boot guards were bypassed (defence in depth).
 */
import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import {
  isInterimSoftwareKeyAllowed,
  isProductionEnv,
} from "../boot/production-env.js";
import {
  getReceiptKmsSigner,
  isReceiptKmsConfigured,
} from "./kms-ed25519.js";

export type KeyCustody = "kms" | "software_interim" | "software";

export class ReceiptSigningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptSigningError";
  }
}

export type ReceiptSigning = {
  key_id: string;
  custody: KeyCustody;
  sign(digest: Uint8Array): Promise<Uint8Array>;
  publicKeyB64(): Promise<string>;
};

export const DEV_RECEIPT_KEY_ID = "receipt_dev";

/** Plain wording shown on receipts, Verify and the PDF. */
export function custodyLabel(custody: KeyCustody | string | null | undefined): string {
  switch (custody) {
    case "kms":
      return "Key custody: AWS KMS (private key never leaves KMS)";
    case "software_interim":
      return "Key custody: software key (interim)";
    case "software":
      return "Key custody: software key (demo tenant)";
    default:
      return "Key custody: unknown";
  }
}

/** One sentence for Settings / PDF / README — do not claim the demo key is in an HSM. */
export const CUSTODY_PRODUCTION_NOTE =
  "Production deployments can use a customer-held key in AWS KMS, GCP KMS or an HSM. The private key never leaves the customer’s key store.";

/** Stable key id for a KMS key when AEGIS_RECEIPT_KEY_ID is not set. */
export function derivedKmsReceiptKeyId(kmsKeyId: string): string {
  return `kms_${createHash("sha256").update(kmsKeyId.trim()).digest("hex").slice(0, 12)}`;
}

/** The key id receipts will carry (no secrets involved). */
export function receiptKeyIdFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.AEGIS_RECEIPT_KEY_ID?.trim();
  if (explicit) return explicit;
  const kms = env.AEGIS_RECEIPT_KMS_KEY_ID?.trim();
  return kms ? derivedKmsReceiptKeyId(kms) : DEV_RECEIPT_KEY_ID;
}

/** How the key this process signs with is held (reads no secrets). */
export function configuredCustody(
  env: NodeJS.ProcessEnv = process.env,
): KeyCustody {
  if (isReceiptKmsConfigured(env)) return "kms";
  if (isProductionEnv(env) && isInterimSoftwareKeyAllowed(env)) {
    return "software_interim";
  }
  return "software";
}

/** True when some receipt signing key (KMS or software seed) is configured. */
export function isReceiptSigningConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isReceiptKmsConfigured(env) ||
    Boolean(env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim())
  );
}

function softwareSigning(
  keyId: string,
  seedB64: string,
  custody: KeyCustody,
): ReceiptSigning {
  const seed = Buffer.from(seedB64, "base64");
  if (seed.length !== 32) {
    throw new ReceiptSigningError("Ed25519 private key must be 32 bytes");
  }
  return {
    key_id: keyId,
    custody,
    sign: (digest) => ed.signAsync(digest, seed),
    publicKeyB64: async () =>
      Buffer.from(await ed.getPublicKeyAsync(seed)).toString("base64"),
  };
}

export async function resolveReceiptSigning(options?: {
  env?: NodeJS.ProcessEnv;
  /** Test / demo override (software key). Refused in production. */
  override?: { key_id: string; private_key_b64: string };
}): Promise<ReceiptSigning> {
  const env = options?.env ?? process.env;
  const production = isProductionEnv(env);

  if (options?.override) {
    if (production) {
      throw new ReceiptSigningError(
        "Software signing override is refused in production",
      );
    }
    return softwareSigning(
      options.override.key_id,
      options.override.private_key_b64,
      "software",
    );
  }

  const keyId = receiptKeyIdFromEnv(env);

  if (isReceiptKmsConfigured(env)) {
    if (production && keyId === DEV_RECEIPT_KEY_ID) {
      throw new ReceiptSigningError(
        `Receipt key id ${DEV_RECEIPT_KEY_ID} is refused in production`,
      );
    }
    const signer = getReceiptKmsSigner();
    if (!signer) throw new ReceiptSigningError("KMS signer unavailable");
    return {
      key_id: keyId,
      custody: "kms",
      sign: (digest) => signer.sign(digest),
      publicKeyB64: () => signer.getPublicKeyB64(),
    };
  }

  const seedB64 = env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim();
  if (!seedB64) {
    throw new ReceiptSigningError(
      "Receipt signing key not configured (AEGIS_RECEIPT_KMS_KEY_ID or AEGIS_RECEIPT_SIGNING_KEY_B64)",
    );
  }
  if (production) {
    if (keyId === DEV_RECEIPT_KEY_ID) {
      throw new ReceiptSigningError(
        `Receipt key id ${DEV_RECEIPT_KEY_ID} is refused in production`,
      );
    }
    if (!isInterimSoftwareKeyAllowed(env)) {
      throw new ReceiptSigningError(
        "Software receipt key refused in production: configure AEGIS_RECEIPT_KMS_KEY_ID " +
          "or set AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim",
      );
    }
    return softwareSigning(keyId, seedB64, "software_interim");
  }
  return softwareSigning(keyId, seedB64, "software");
}
