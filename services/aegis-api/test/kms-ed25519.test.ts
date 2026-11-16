/**
 * KMS Ed25519 signer against a mock KMS client that enforces the real AWS call
 * shapes: KeySpec ECC_NIST_EDWARDS25519, SigningAlgorithm ED25519_SHA_512,
 * MessageType RAW (pure Ed25519, never ED25519_PH_SHA_512 / DIGEST).
 */
import { GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import * as ed from "@noble/ed25519";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ED25519_SPKI_PREFIX,
  KmsEd25519Signer,
  KmsSignerError,
  extractEd25519PublicKeyFromSpki,
  regionFromKmsKeyId,
  type KmsClientLike,
} from "../src/crypto/kms-ed25519.js";
import {
  buildReceiptBody,
  receiptSigningDigest,
  signForensicReceiptWith,
  verifyForensicReceiptSignature,
} from "../src/forensic/receipt.js";
import { verifyForensicBundle } from "../src/forensic/verify-bundle.js";

const ARN =
  "arn:aws:kms:eu-west-1:111122223333:key/11111111-2222-3333-4444-555555555555";

type Recorded = { name: string; input: Record<string, unknown> };

/** Behaves like AWS KMS for an ECC_NIST_EDWARDS25519 key; records every call. */
function mockKms(opts?: {
  keySpec?: string;
  signature?: (digest: Uint8Array) => Uint8Array;
  failSign?: boolean;
}) {
  const seed = ed.utils.randomPrivateKey();
  const calls: Recorded[] = [];
  const state: { pub: Uint8Array | null } = { pub: null };
  const client: KmsClientLike = {
    async send(command: unknown) {
      if (command instanceof GetPublicKeyCommand) {
        calls.push({ name: "GetPublicKey", input: { ...command.input } });
        state.pub ??= await ed.getPublicKeyAsync(seed);
        return {
          KeyId: ARN,
          PublicKey: Buffer.concat([ED25519_SPKI_PREFIX, state.pub]),
          KeySpec: opts?.keySpec ?? "ECC_NIST_EDWARDS25519",
          KeyUsage: "SIGN_VERIFY",
          SigningAlgorithms: ["ED25519_SHA_512", "ED25519_PH_SHA_512"],
        };
      }
      if (command instanceof SignCommand) {
        calls.push({ name: "Sign", input: { ...command.input } });
        const input = command.input;
        // AWS rejects anything but pure Ed25519 over a RAW message for this scheme.
        if (input.MessageType !== "RAW" || input.SigningAlgorithm !== "ED25519_SHA_512") {
          const err = new Error("ValidationException");
          err.name = "ValidationException";
          throw err;
        }
        if (opts?.failSign) {
          const err = new Error("not authorized to perform kms:Sign on arn:aws:kms:...");
          err.name = "AccessDeniedException";
          throw err;
        }
        const message = input.Message as Uint8Array;
        const sig = opts?.signature
          ? opts.signature(message)
          : await ed.signAsync(message, seed);
        return { KeyId: ARN, Signature: sig, SigningAlgorithm: "ED25519_SHA_512" };
      }
      throw new Error("unexpected command");
    },
  };
  return { client, calls, seed };
}

describe("extractEd25519PublicKeyFromSpki", () => {
  it("strips the 12-byte SPKI prefix 30 2a 30 05 06 03 2b 65 70 03 21 00", async () => {
    expect(ED25519_SPKI_PREFIX.toString("hex")).toBe("302a300506032b6570032100");
    const pub = await ed.getPublicKeyAsync(ed.utils.randomPrivateKey());
    const der = Buffer.concat([ED25519_SPKI_PREFIX, pub]);
    expect(der.length).toBe(44);
    expect(Buffer.from(extractEd25519PublicKeyFromSpki(der))).toEqual(Buffer.from(pub));
  });

  it("rejects a non-Ed25519 or truncated SPKI", () => {
    expect(() => extractEd25519PublicKeyFromSpki(new Uint8Array(44))).toThrow(
      KmsSignerError,
    );
    expect(() =>
      extractEd25519PublicKeyFromSpki(Buffer.concat([ED25519_SPKI_PREFIX, Buffer.alloc(31)])),
    ).toThrow(/unexpected prefix or length/);
    // an RSA / EC SPKI is longer and has a different prefix
    expect(() => extractEd25519PublicKeyFromSpki(Buffer.alloc(91, 1))).toThrow(
      KmsSignerError,
    );
  });
});

describe("KmsEd25519Signer", () => {
  it("regionFromKmsKeyId reads the region out of an ARN", () => {
    expect(regionFromKmsKeyId(ARN)).toBe("eu-west-1");
    expect(regionFromKmsKeyId("11111111-2222-3333-4444-555555555555")).toBeNull();
  });

  it("GetPublicKey sends KeyId and returns the raw 32-byte key", async () => {
    const kms = mockKms();
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    const pub = await signer.getPublicKey();
    expect(pub.length).toBe(32);
    expect(Buffer.from(pub)).toEqual(Buffer.from(await ed.getPublicKeyAsync(kms.seed)));
    expect(kms.calls).toEqual([{ name: "GetPublicKey", input: { KeyId: ARN } }]);
    await signer.getPublicKey(); // cached
    expect(kms.calls.filter((c) => c.name === "GetPublicKey")).toHaveLength(1);
  });

  it("Sign uses the exact AWS names: RAW message, ED25519_SHA_512", async () => {
    const kms = mockKms();
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    const digest = createHash("sha256").update("receipt").digest();
    const sig = await signer.sign(digest);
    const sign = kms.calls.find((c) => c.name === "Sign")!;
    expect(sign.input).toEqual({
      KeyId: ARN,
      Message: digest,
      MessageType: "RAW",
      SigningAlgorithm: "ED25519_SHA_512",
    });
    expect(sign.input.SigningAlgorithm).not.toBe("ED25519_PH_SHA_512");
    expect(sig.length).toBe(64);
    // same bytes noble would sign: pure Ed25519 over the 32 digest bytes
    expect(
      await ed.verifyAsync(sig, digest, await ed.getPublicKeyAsync(kms.seed)),
    ).toBe(true);
  });

  it("refuses a key that is not ECC_NIST_EDWARDS25519", async () => {
    const kms = mockKms({ keySpec: "ECC_NIST_P256" });
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    await expect(signer.getPublicKey()).rejects.toMatchObject({ code: "wrong_key_spec" });
  });

  it("refuses a signature that does not verify with the KMS public key", async () => {
    const kms = mockKms({ signature: () => new Uint8Array(64).fill(9) });
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    await expect(signer.sign(new Uint8Array(32))).rejects.toMatchObject({
      code: "signature_self_check_failed",
    });
  });

  it("refuses a wrong-length signature", async () => {
    const kms = mockKms({ signature: () => new Uint8Array(63) });
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    await expect(signer.sign(new Uint8Array(32))).rejects.toMatchObject({
      code: "bad_signature_length",
    });
  });

  it("surfaces AWS errors by name only (no ARN / message leak)", async () => {
    const kms = mockKms({ failSign: true });
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    const err = await signer.sign(new Uint8Array(32)).catch((e: Error) => e);
    expect((err as Error).message).toBe("KMS Sign failed: AccessDeniedException");
    expect((err as Error).message).not.toContain("arn:");
  });
});

describe("KMS-signed forensic receipts verify like software-signed ones", () => {
  async function receipt(signer: KmsEd25519Signer, seq: number, prev: string | null) {
    return signForensicReceiptWith(
      buildReceiptBody({
        organization_id: "00000000-0000-0000-0000-000000000001",
        seq,
        prev_hash: prev,
        case_id: `case-${seq}`,
        decision_id: `dec-${seq}`,
        outcome: "allow",
        mode: "enforce",
        matched_rules: [],
        sealed_events: [
          { event_id: `evt_${seq}`, event_hash: `sha256:${seq}`, sequence_num: seq },
        ],
        flags: { key_custody: "kms" },
        key_id: "receipt_kms_test",
      }),
      signer,
    );
  }

  it("verifies with the published public key and the aegis-verify path", async () => {
    const kms = mockKms();
    const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
    const r1 = await receipt(signer, 1, null);
    const r2 = await receipt(signer, 2, r1.receipt_hash);
    const pubB64 = await signer.getPublicKeyB64();

    expect(await verifyForensicReceiptSignature(r1, pubB64)).toBe(true);
    expect(r1.flags?.key_custody).toBe("kms");

    // exactly the digest the Sign call received
    const digest = receiptSigningDigest(
      r1 as unknown as Record<string, unknown>,
      r1.key_id,
    );
    const sign = kms.calls.find((c) => c.name === "Sign")!;
    expect(Buffer.from(sign.input.Message as Uint8Array)).toEqual(Buffer.from(digest));

    const result = await verifyForensicBundle({
      receipts: [r1, r2],
      keys: { receipt_kms_test: pubB64 },
    });
    expect(result.ok).toBe(true);

    // flipping a signed fact (or stripping custody) breaks it
    const tampered = {
      ...r1,
      flags: { ...r1.flags, key_custody: undefined },
    } as typeof r1;
    expect(await verifyForensicReceiptSignature(tampered, pubB64)).toBe(false);
  });
});
