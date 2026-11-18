import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  eventHash,
  jcs,
  keyPairFromSeed,
  signEnvelope,
  signatureInputHex,
  verifyEnvelope,
  type SignedEnvelope,
} from "../src/index.js";

const vectorsPath = fileURLToPath(new URL("../../../conformance/vectors.json", import.meta.url));
const file = JSON.parse(readFileSync(vectorsPath, "utf8")) as {
  vectors: Array<{
    id: string;
    test_only_private_key_b64: string;
    public_key_b64: string;
    envelope_without_signature: SignedEnvelope;
    event_jcs: string;
    canonical_envelope_jcs: string;
    canonical_envelope_utf8_hex: string;
    event_hash: string;
    signature_input_hash: string;
    signature_b64url: string;
  }>;
  negative_vectors: Array<{
    id: string;
    public_key_b64: string;
    envelope: unknown;
    expected: { ok: false; reason: string };
  }>;
};

describe("conformance vectors (AEGIS-SRC1)", () => {
  it("has at least 12 vectors", () => {
    expect(file.vectors.length).toBeGreaterThanOrEqual(12);
  });

  for (const v of file.vectors) {
    it(`positive: ${v.id}`, async () => {
      const env = v.envelope_without_signature;
      expect(jcs(env.event)).toBe(v.event_jcs);
      expect(eventHash(env.event)).toBe(v.event_hash);
      expect(env.event_hash).toBe(v.event_hash);

      const canonical = jcs(env);
      expect(canonical).toBe(v.canonical_envelope_jcs);
      expect(Buffer.from(canonical, "utf8").toString("hex")).toBe(v.canonical_envelope_utf8_hex);
      expect(signatureInputHex(env)).toBe(v.signature_input_hash);

      const pair = await keyPairFromSeed(v.test_only_private_key_b64);
      expect(pair.publicKeyB64).toBe(v.public_key_b64);

      const signed = await signEnvelope(env, v.test_only_private_key_b64);
      expect(signed.signature).toBe(v.signature_b64url);

      const full = { ...env, signature: v.signature_b64url };
      expect(await verifyEnvelope(full, v.public_key_b64)).toEqual({ ok: true });
    });
  }

  for (const v of file.negative_vectors) {
    it(`negative: ${v.id}`, async () => {
      const result = await verifyEnvelope(v.envelope, v.public_key_b64);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(v.expected.reason);
      }
    });
  }
});
