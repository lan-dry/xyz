/**
 * AWS KMS Ed25519 (pure EdDSA) signer for forensic receipts.
 *
 * Exact AWS identifiers (do not substitute):
 *   KeySpec          ECC_NIST_EDWARDS25519
 *   SigningAlgorithm ED25519_SHA_512
 *   MessageType      RAW   (pure Ed25519, FIPS 186-5 section 7.6; NOT ED25519_PH_SHA_512)
 *
 * A forensic receipt signs the 32-byte SHA-256 digest from receiptSigningDigest()
 * with pure Ed25519 (noble hashes the message with SHA-512 internally). We pass
 * those same 32 digest bytes to KMS Sign as the RAW message, so the signature
 * verifies against the published 32-byte public key in aegis-verify with no
 * change to the verifier.
 *
 * The private key never leaves KMS. Required IAM: kms:Sign and kms:GetPublicKey
 * on the one key ARN (see docs/KEY_CUSTODY.md).
 */
import {
  GetPublicKeyCommand,
  KMSClient,
  SignCommand,
} from "@aws-sdk/client-kms";
import * as ed from "@noble/ed25519";

export const KMS_KEY_SPEC = "ECC_NIST_EDWARDS25519" as const; // gitleaks:allow
export const KMS_SIGNING_ALGORITHM = "ED25519_SHA_512" as const;
export const KMS_MESSAGE_TYPE = "RAW" as const;

/** ASN.1 SubjectPublicKeyInfo prefix for an Ed25519 key; the 32 key bytes follow. */
export const ED25519_SPKI_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);

export class KmsSignerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bad_public_key"
      | "wrong_key_spec"
      | "no_signature"
      | "bad_signature_length"
      | "signature_self_check_failed"
      | "kms_error",
  ) {
    super(message);
    this.name = "KmsSignerError";
  }
}

/** Extract the raw 32-byte Ed25519 public key from a KMS GetPublicKey SPKI DER blob. */
export function extractEd25519PublicKeyFromSpki(der: Uint8Array): Uint8Array {
  const buf = Buffer.from(der);
  if (
    buf.length !== ED25519_SPKI_PREFIX.length + 32 ||
    !buf.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    throw new KmsSignerError(
      "KMS public key is not an Ed25519 SubjectPublicKeyInfo (unexpected prefix or length)",
      "bad_public_key",
    );
  }
  return new Uint8Array(buf.subarray(ED25519_SPKI_PREFIX.length));
}

/** Minimal surface of KMSClient we use; lets tests inject a mock with real call shapes. */
export type KmsClientLike = {
  send(command: unknown): Promise<unknown>;
};

type SignOutput = { Signature?: Uint8Array };
type GetPublicKeyOutput = {
  PublicKey?: Uint8Array;
  KeySpec?: string;
  KeyUsage?: string;
  SigningAlgorithms?: string[];
};

/** Region from an ARN (arn:aws:kms:<region>:<acct>:key/<id>), else null. */
export function regionFromKmsKeyId(keyId: string): string | null {
  const m = /^arn:[^:]+:kms:([a-z0-9-]+):/.exec(keyId.trim());
  return m ? m[1]! : null;
}

export type KmsEd25519SignerOptions = {
  /** KMS key id, key ARN or alias ARN. */
  keyId: string;
  region?: string;
  client?: KmsClientLike;
};

export class KmsEd25519Signer {
  readonly keyId: string;
  private readonly client: KmsClientLike;
  private publicKey: Uint8Array | null = null;

  constructor(options: KmsEd25519SignerOptions) {
    this.keyId = options.keyId.trim();
    const region =
      options.region?.trim() ||
      regionFromKmsKeyId(this.keyId) ||
      process.env.AEGIS_RECEIPT_KMS_REGION?.trim() ||
      process.env.AWS_REGION?.trim() ||
      process.env.AWS_DEFAULT_REGION?.trim();
    this.client =
      options.client ??
      (new KMSClient(region ? { region } : {}) as unknown as KmsClientLike);
  }

  /** Fetch (and cache) the 32-byte public key; validates key spec and algorithm. */
  async getPublicKey(): Promise<Uint8Array> {
    if (this.publicKey) return this.publicKey;
    let out: GetPublicKeyOutput;
    try {
      out = (await this.client.send(
        new GetPublicKeyCommand({ KeyId: this.keyId }),
      )) as GetPublicKeyOutput;
    } catch (err) {
      throw new KmsSignerError(
        `KMS GetPublicKey failed: ${errorName(err)}`,
        "kms_error",
      );
    }
    if (out.KeySpec !== KMS_KEY_SPEC) {
      throw new KmsSignerError(
        `KMS key spec is ${String(out.KeySpec)}, expected ${KMS_KEY_SPEC}`,
        "wrong_key_spec",
      );
    }
    if (
      out.SigningAlgorithms &&
      !out.SigningAlgorithms.includes(KMS_SIGNING_ALGORITHM)
    ) {
      throw new KmsSignerError(
        `KMS key does not support ${KMS_SIGNING_ALGORITHM}`,
        "wrong_key_spec",
      );
    }
    if (!out.PublicKey) {
      throw new KmsSignerError("KMS GetPublicKey returned no key", "bad_public_key");
    }
    this.publicKey = extractEd25519PublicKeyFromSpki(out.PublicKey);
    return this.publicKey;
  }

  async getPublicKeyB64(): Promise<string> {
    return Buffer.from(await this.getPublicKey()).toString("base64");
  }

  /**
   * Sign `digest` (the 32-byte receipt digest) as a RAW message.
   * The signature is checked against the KMS public key before it is returned,
   * so a mis-configured key can never produce a receipt that fails verification.
   */
  async sign(digest: Uint8Array): Promise<Uint8Array> {
    let out: SignOutput;
    try {
      out = (await this.client.send(
        new SignCommand({
          KeyId: this.keyId,
          Message: digest,
          MessageType: KMS_MESSAGE_TYPE,
          SigningAlgorithm: KMS_SIGNING_ALGORITHM,
        }),
      )) as SignOutput;
    } catch (err) {
      throw new KmsSignerError(`KMS Sign failed: ${errorName(err)}`, "kms_error");
    }
    if (!out.Signature) {
      throw new KmsSignerError("KMS Sign returned no signature", "no_signature");
    }
    const signature = new Uint8Array(out.Signature);
    if (signature.length !== 64) {
      throw new KmsSignerError(
        `KMS signature is ${signature.length} bytes, expected 64`,
        "bad_signature_length",
      );
    }
    const pub = await this.getPublicKey();
    if (!(await ed.verifyAsync(signature, digest, pub))) {
      throw new KmsSignerError(
        "KMS signature did not verify against the KMS public key",
        "signature_self_check_failed",
      );
    }
    return signature;
  }
}

/** AWS errors carry a name (AccessDeniedException ...); never echo messages that may include ARNs. */
function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    return String((err as { name: unknown }).name);
  }
  return "UnknownError";
}

let sharedSigner: { keyId: string; signer: KmsEd25519Signer } | null = null;

export function isReceiptKmsConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.AEGIS_RECEIPT_KMS_KEY_ID?.trim());
}

/** Process-wide signer for AEGIS_RECEIPT_KMS_KEY_ID (null when not configured). */
export function getReceiptKmsSigner(): KmsEd25519Signer | null {
  const keyId = process.env.AEGIS_RECEIPT_KMS_KEY_ID?.trim();
  if (!keyId) return null;
  if (!sharedSigner || sharedSigner.keyId !== keyId) {
    sharedSigner = { keyId, signer: new KmsEd25519Signer({ keyId }) };
  }
  return sharedSigner.signer;
}

/** Test hook. */
export function resetReceiptKmsSignerForTests(
  signer?: { keyId: string; signer: KmsEd25519Signer } | null,
): void {
  sharedSigner = signer ?? null;
}
