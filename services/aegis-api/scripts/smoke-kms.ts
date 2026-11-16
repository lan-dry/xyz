/**
 * pnpm smoke:kms
 *
 * Proves the AWS KMS receipt key works end to end:
 *   GetPublicKey (ECC_NIST_EDWARDS25519) -> Sign (ED25519_SHA_512, RAW) on a real
 *   receipt digest -> the receipt verifies with the published 32-byte public key
 *   using the same code aegis-verify uses.
 *
 * Prints PASS / FAIL / SKIP. SKIP (exit 0) when AEGIS_RECEIPT_KMS_KEY_ID or AWS
 * credentials are not available. FAIL exits 1. Never prints keys, ARNs or secrets.
 */
import { KMSClient } from "@aws-sdk/client-kms";
import "../src/db/load-env.js";
import {
  KmsEd25519Signer,
  regionFromKmsKeyId,
} from "../src/crypto/kms-ed25519.js";
import { receiptKeyIdFromEnv } from "../src/crypto/receipt-signing.js";
import { fingerprintOfPublicKey } from "../src/repo/receipt-keys.js";
import {
  buildReceiptBody,
  signForensicReceiptWith,
  verifyForensicReceiptSignature,
} from "../src/forensic/receipt.js";

function out(status: "PASS" | "FAIL" | "SKIP", detail: string): never {
  console.log(`${status} smoke:kms ${detail}`);
  process.exit(status === "FAIL" ? 1 : 0);
}

async function main(): Promise<never> {
  const keyId = process.env.AEGIS_RECEIPT_KMS_KEY_ID?.trim();
  if (!keyId) return out("SKIP", "AEGIS_RECEIPT_KMS_KEY_ID is not set");

  const region =
    regionFromKmsKeyId(keyId) ??
    (process.env.AEGIS_RECEIPT_KMS_REGION?.trim() ||
      process.env.AWS_REGION?.trim() ||
      process.env.AWS_DEFAULT_REGION?.trim());
  const client = new KMSClient(region ? { region } : {});
  try {
    await client.config.credentials();
  } catch {
    return out("SKIP", "no AWS credentials available (default provider chain)");
  }

  const signer = new KmsEd25519Signer({ keyId, region, client });
  const receiptKeyId = receiptKeyIdFromEnv();
  try {
    const publicKeyB64 = await signer.getPublicKeyB64();
    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000000",
      seq: 1,
      prev_hash: null,
      case_id: "smoke-kms",
      decision_id: "smoke-kms",
      outcome: "allow",
      mode: "record_only",
      matched_rules: [],
      sealed_events: [
        { event_id: "evt_smoke_kms", event_hash: "sha256:smoke", sequence_num: 1 },
      ],
      key_id: receiptKeyId,
      flags: { key_custody: "kms" },
    });
    const signed = await signForensicReceiptWith(body, signer);
    const verified = await verifyForensicReceiptSignature(signed, publicKeyB64);
    if (!verified) {
      return out("FAIL", "KMS signature does not verify with the published public key");
    }
    return out(
      "PASS",
      `key_id=${receiptKeyId} fingerprint=${fingerprintOfPublicKey(publicKeyB64)} ` +
        "(KeySpec ECC_NIST_EDWARDS25519, ED25519_SHA_512, RAW)",
    );
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "Error";
    const code =
      err && typeof err === "object" && "code" in err
        ? ` ${String((err as { code: unknown }).code)}`
        : "";
    return out("FAIL", `${name}${code}`);
  }
}

await main();
