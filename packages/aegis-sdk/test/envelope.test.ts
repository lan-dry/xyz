import { describe, expect, it } from "vitest";
import {
  buildEnvelope,
  eventHash,
  generateKeyPair,
  jcs,
  sha256Hex,
  signEnvelope,
  verifyEnvelope,
  type BusinessEvent,
  type SignedEnvelope,
} from "../src/index.js";

const event: BusinessEvent = {
  type: "payout.requested",
  amount: "1234.50",
  currency: "USD",
  meta: { b: [1, 2], a: null },
};

function baseEnvelope() {
  return buildEnvelope({
    source_id: "src_los",
    key_id: "k_los_2026_01",
    seq: 1042,
    ts: "2026-11-18T10:01:22.123Z",
    event,
  });
}

describe("sign/verify roundtrip", () => {
  it("signs and verifies", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    expect(signed.aegis_envelope).toBe("1");
    expect(signed.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await verifyEnvelope(signed, keys.publicKey)).toEqual({ ok: true });
    // string key forms are accepted too
    expect(await verifyEnvelope(signed, keys.publicKeyB64)).toEqual({ ok: true });
  });

  it("fills nonce (16 bytes), uuid idempotency key, event_hash", () => {
    const env = baseEnvelope();
    expect(Buffer.from(env.nonce, "base64url")).toHaveLength(16);
    expect(env.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(env.event_hash).toBe(sha256Hex(jcs(event)));
    expect(env.event_hash).toBe(eventHash(event));
  });

  it("event key order does not affect hash or signature validity", async () => {
    const keys = await generateKeyPair();
    const reordered = { meta: { a: null, b: [1, 2] }, currency: "USD", amount: "1234.50", type: "payout.requested" };
    expect(eventHash(reordered)).toBe(eventHash(event));
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const swapped: SignedEnvelope = { ...signed, event: reordered };
    expect(await verifyEnvelope(swapped, keys.publicKey)).toEqual({ ok: true });
  });
});

describe("forged / tampered envelopes", () => {
  it("rejects a forged signature", async () => {
    const keys = await generateKeyPair();
    const attacker = await generateKeyPair();
    const forged = await signEnvelope(baseEnvelope(), attacker.privateKey);
    expect(await verifyEnvelope(forged, keys.publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a bit-flipped signature", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const sig = Buffer.from(signed.signature, "base64url");
    sig[10] ^= 0x80;
    const result = await verifyEnvelope({ ...signed, signature: sig.toString("base64url") }, keys.publicKey);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("detects a tampered event via event_hash", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const tampered = { ...signed, event: { ...signed.event, amount: "9999.99" } };
    expect(await verifyEnvelope(tampered, keys.publicKey)).toEqual({
      ok: false,
      reason: "event_hash_mismatch",
    });
  });

  it("detects a tampered event even if event_hash is recomputed", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const event2 = { ...signed.event, amount: "9999.99" };
    const tampered = { ...signed, event: event2, event_hash: eventHash(event2) };
    expect(await verifyEnvelope(tampered, keys.publicKey)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("signature binds seq, ts, source_id, key_id, nonce and idempotency_key", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const variants: Partial<SignedEnvelope>[] = [
      { seq: signed.seq + 1 },
      { ts: "2026-11-18T10:01:22.124Z" },
      { source_id: "src_other" },
      { key_id: "k_other" },
      { nonce: Buffer.alloc(16, 9).toString("base64url") },
      { idempotency_key: "00000000-0000-4000-8000-000000000000" },
    ];
    for (const patch of variants) {
      const result = await verifyEnvelope({ ...signed, ...patch }, keys.publicKey);
      expect(result, JSON.stringify(patch)).toEqual({ ok: false, reason: "bad_signature" });
    }
  });

  it("reports malformed input without throwing", async () => {
    const keys = await generateKeyPair();
    const signed = await signEnvelope(baseEnvelope(), keys.privateKey);
    const { signature: _sig, ...noSig } = signed;
    const cases: unknown[] = [null, "x", [], {}, noSig, { ...signed, extra: 1 }, { ...signed, seq: 0 }, { ...signed, seq: 1.5 }];
    for (const bad of cases) {
      const result = await verifyEnvelope(bad, keys.publicKey);
      expect(result.ok).toBe(false);
    }
    expect(await verifyEnvelope({ ...signed, aegis_envelope: "2" }, keys.publicKey)).toEqual({
      ok: false,
      reason: "unsupported_version",
    });
  });
});

describe("input validation", () => {
  it("rejects floats in events (money must be decimal strings)", () => {
    expect(() => eventHash({ amount: 12.5 })).toThrow(/safe integers/);
    expect(() => eventHash({ amount: Number.NaN })).toThrow();
    expect(() => eventHash({ nested: { n: 2 ** 60 } })).toThrow();
    expect(() => eventHash({ u: undefined } as unknown as BusinessEvent)).toThrow();
  });

  it("refuses to sign an envelope whose event_hash is wrong", async () => {
    const keys = await generateKeyPair();
    const env = baseEnvelope();
    await expect(
      signEnvelope({ ...env, event: { ...env.event, amount: "1.00" } }, keys.privateKey),
    ).rejects.toThrow(/event_hash/);
  });

  it("rejects bad keys", async () => {
    await expect(signEnvelope(baseEnvelope(), new Uint8Array(31))).rejects.toThrow();
  });
});
