import { readFileSync } from "node:fs";
import { signEvent, signingDigest, type ApsEvent } from "@salanor/aegis";
import * as ed from "@noble/ed25519";
import { decryptBridgePrivateKey } from "./bridge-key-vault.js";

export type SigningKeyMaterial = {
  key_id: string;
  kms_provider: string | null;
  kms_key_arn: string | null;
  public_key_b64: string;
  private_key_ciphertext: string | null;
};

async function signWithLocalPrivateKey(
  event: ApsEvent,
  keyId: string,
  privateKeyB64: string,
): Promise<ApsEvent> {
  return signEvent(event, { privateKeyB64, keyId });
}

function resolveLocalPrivateKeyB64(keyId: string): string | null {
  const perKey = process.env[`AEGIS_SIGNING_KEY_${keyId.toUpperCase().replace(/-/g, "_")}_B64`]?.trim();
  if (perKey) return perKey;

  const filePath = process.env.AEGIS_SIGNING_KEY_FILE?.trim();
  if (filePath) {
    const raw = readFileSync(filePath, "utf8").trim();
    return raw;
  }

  return process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() ?? null;
}

async function signWithAwsKms(
  event: ApsEvent,
  keyArn: string,
  keyId: string,
): Promise<ApsEvent> {
  const { KMSClient, SignCommand } = await import("@aws-sdk/client-kms");
  const digest = signingDigest(event as Record<string, unknown>, keyId);
  const client = new KMSClient({});
  const result = await client.send(
    new SignCommand({
      KeyId: keyArn,
      Message: Buffer.from(digest),
      MessageType: "RAW",
      SigningAlgorithm: "ED25519_SHA_512",
    }),
  );
  if (!result.Signature) {
    throw new Error(`AWS KMS Sign returned no signature for ${keyArn}`);
  }
  return {
    ...event,
    sig_alg: "ed25519",
    sig_value_b64: Buffer.from(result.Signature).toString("base64"),
  };
}

async function signWithGcpKms(
  event: ApsEvent,
  keyVersionName: string,
  keyId: string,
): Promise<ApsEvent> {
  const digest = signingDigest(event as Record<string, unknown>, keyId);
  const accessToken = process.env.GCP_KMS_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("GCP_KMS_ACCESS_TOKEN required for gcp kms_provider signing");
  }
  const url = `https://cloudkms.googleapis.com/v1/${keyVersionName}:asymmetricSign`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      digest: { sha256: Buffer.from(digest).toString("base64") },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GCP KMS sign failed (${response.status}): ${body}`);
  }
  const json = (await response.json()) as { signature?: string };
  if (!json.signature) {
    throw new Error("GCP KMS sign returned no signature");
  }
  return {
    ...event,
    sig_alg: "ed25519",
    sig_value_b64: json.signature,
  };
}

async function signWithHashicorpVault(
  event: ApsEvent,
  transitKey: string,
  keyId: string,
): Promise<ApsEvent> {
  const vaultAddr = process.env.VAULT_ADDR?.trim()?.replace(/\/$/, "");
  const vaultToken = process.env.VAULT_TOKEN?.trim();
  if (!vaultAddr || !vaultToken) {
    throw new Error("VAULT_ADDR and VAULT_TOKEN required for vault kms_provider signing");
  }

  const keyName = transitKey.replace(/^transit\//, "").replace(/^keys\//, "");
  const digest = signingDigest(event as Record<string, unknown>, keyId);
  const response = await fetch(`${vaultAddr}/v1/transit/sign/${encodeURIComponent(keyName)}`, {
    method: "POST",
    headers: {
      "X-Vault-Token": vaultToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: Buffer.from(digest).toString("base64"),
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Vault transit sign failed (${response.status}): ${body}`);
  }
  const json = (await response.json()) as { data?: { signature?: string } };
  const vaultSig = json.data?.signature;
  if (!vaultSig) {
    throw new Error("Vault transit sign returned no signature");
  }
  const raw = vaultSig.includes(":") ? vaultSig.split(":").pop()! : vaultSig;
  return {
    ...event,
    sig_alg: "ed25519",
    sig_value_b64: raw,
  };
}

/**
 * Server-side APS-1 signing using customer-controlled material (BYOK).
 * - customer: client-held only (no server sign)
 * - aws/gcp/vault: KMS Sign on customer ARN or Vault transit key name
 * - vault/dev + ciphertext: bridge vault decrypt
 * - dev: env AEGIS_SIGNING_KEY_FILE / DEV_SIGNING_PRIVATE_KEY_B64
 */
export async function signApsEventWithKey(
  event: ApsEvent,
  key: SigningKeyMaterial,
): Promise<ApsEvent> {
  const provider = (key.kms_provider ?? "dev").toLowerCase();

  if (provider === "customer") {
    throw new Error(
      `Key ${key.key_id} is customer-held (BYOK). Sign on the client; server verifies only.`,
    );
  }

  if (provider === "aws" && key.kms_key_arn) {
    return signWithAwsKms(event, key.kms_key_arn, key.key_id);
  }

  if (provider === "gcp" && key.kms_key_arn) {
    return signWithGcpKms(event, key.kms_key_arn, key.key_id);
  }

  if (provider === "vault" && key.kms_key_arn) {
    return signWithHashicorpVault(event, key.kms_key_arn, key.key_id);
  }

  if (key.private_key_ciphertext) {
    const privateKeyB64 = decryptBridgePrivateKey(key.private_key_ciphertext);
    return signWithLocalPrivateKey(event, key.key_id, privateKeyB64);
  }

  const local = resolveLocalPrivateKeyB64(key.key_id);
  if (local) {
    return signWithLocalPrivateKey(event, key.key_id, local);
  }

  throw new Error(
    `No signing material for key ${key.key_id} (provider=${provider}). Configure KMS ARN, bridge vault, or AEGIS_SIGNING_KEY_FILE.`,
  );
}

/** Register-only BYOK: verify public key matches 32-byte Ed25519. */
export function validateEd25519PublicKey(publicKeyB64: string): void {
  const key = Buffer.from(publicKeyB64, "base64");
  if (key.length !== 32) {
    throw new Error("Ed25519 public key must be 32 bytes (base64)");
  }
}

/** Optional self-test that local material can sign (dev health checks). */
export async function assertSigningKeyWorks(key: SigningKeyMaterial): Promise<boolean> {
  try {
    const testEvent: ApsEvent = {
      schema_version: 1,
      event_id: "evt_selftest000000000000000001",
      organization_id: "org_selftest",
      trace_id: "trc_selftest000000000000000001",
      agent_id: "agt_selftest",
      key_id: key.key_id,
      emitted_at: new Date().toISOString(),
      actor_type: "system",
      actor_principal: "signing-selftest",
      action_kind: "provenance_claim",
      policy_decision: "allow",
      payload: {},
    };
    const signed = await signApsEventWithKey(testEvent, key);
    const digest = signingDigest(signed as Record<string, unknown>, key.key_id);
    const sig = Buffer.from(signed.sig_value_b64!, "base64");
    const pub = Buffer.from(key.public_key_b64, "base64");
    return ed.verifyAsync(sig, digest, pub);
  } catch {
    return false;
  }
}
