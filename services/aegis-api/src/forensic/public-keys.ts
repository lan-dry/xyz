/**
 * Public receipt keys for GET /v1/public/keys (and keys.json).
 * Everything here is public: key id, public key, fingerprint, custody. No ARNs,
 * no account ids, no private material.
 */
import {
  KMS_KEY_SPEC,
  KMS_MESSAGE_TYPE,
  KMS_SIGNING_ALGORITHM,
} from "../crypto/kms-ed25519.js";
import {
  configuredCustody,
  custodyLabel,
  type KeyCustody,
} from "../crypto/receipt-signing.js";
import {
  fingerprintOfPublicKey,
  listPublishedReceiptKeys,
  type PublishedReceiptKey,
} from "../repo/receipt-keys.js";
import { getPool } from "../db/pool.js";
import { configuredReceiptKey } from "./evidence-bundle.js";

export type PublicKeyEntry = {
  key_id: string;
  alg: "ed25519";
  public_key_b64: string;
  fingerprint: string;
  custody: KeyCustody;
  custody_label: string;
  status: "active" | "retired";
  created_at: string | null;
  retired_at: string | null;
  kms?: {
    provider: "aws";
    key_spec: typeof KMS_KEY_SPEC;
    signing_algorithm: typeof KMS_SIGNING_ALGORITHM;
    message_type: typeof KMS_MESSAGE_TYPE;
  };
};

function entry(k: {
  key_id: string;
  public_key_b64: string;
  custody: KeyCustody;
  status: "active" | "retired";
  created_at: string | null;
  retired_at: string | null;
  fingerprint?: string;
}): PublicKeyEntry {
  return {
    key_id: k.key_id,
    alg: "ed25519",
    public_key_b64: k.public_key_b64,
    fingerprint: k.fingerprint ?? fingerprintOfPublicKey(k.public_key_b64),
    custody: k.custody,
    custody_label: custodyLabel(k.custody),
    status: k.status,
    created_at: k.created_at,
    retired_at: k.retired_at,
    ...(k.custody === "kms"
      ? {
          kms: {
            provider: "aws" as const,
            key_spec: KMS_KEY_SPEC,
            signing_algorithm: KMS_SIGNING_ALGORITHM,
            message_type: KMS_MESSAGE_TYPE,
          },
        }
      : {}),
  };
}

export async function collectPublicKeys(): Promise<PublicKeyEntry[]> {
  const byId = new Map<string, PublicKeyEntry>();
  if (process.env.DATABASE_URL) {
    try {
      const published: PublishedReceiptKey[] = await listPublishedReceiptKeys(
        getPool(),
      );
      for (const k of published) byId.set(k.key_id, entry(k));
    } catch {
      /* DB down or migration 019 not applied: fall back to the env key */
    }
  }
  const configured = await configuredReceiptKey();
  for (const [keyId, pub] of Object.entries(configured)) {
    const prior = byId.get(keyId);
    byId.set(
      keyId,
      entry({
        key_id: keyId,
        public_key_b64: pub,
        custody: prior?.custody ?? configuredCustody(),
        status: prior?.status ?? "active",
        created_at: prior?.created_at ?? null,
        retired_at: prior?.retired_at ?? null,
      }),
    );
  }
  return [...byId.values()];
}

export const RECEIPT_SIGNATURE_SCHEME =
  "Ed25519 (pure, RFC 8032) over SHA-256 of the text " +
  '"AEGIS-RECEIPT1\\n<key_id>\\n<canonical_payload>"; public_key_b64 is the raw 32-byte key.';
