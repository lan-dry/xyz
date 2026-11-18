import { describe, expect, it } from "vitest";
import {
  buildDecisionToken,
  checkToken,
  diffExecutableParams,
  generateKeyPair,
  paramsHash,
  pickExecutableParams,
  resolveOnAegisUnavailable,
  signDecisionToken,
  tokenSignatureInputHex,
  verifyDecisionToken,
} from "../src/index.js";

const params = {
  amount: "1500000.00",
  currency: "RWF",
  beneficiary_account: "ACCT-1",
  product: "retail_loan",
};

describe("paramsHash / pick / diff", () => {
  it("hashes JCS(params)", () => {
    const h = paramsHash(params);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(paramsHash({ ...params })).toBe(h);
    expect(paramsHash({ product: "retail_loan", currency: "RWF", amount: "1500000.00", beneficiary_account: "ACCT-1" })).toBe(h);
  });

  it("picks only declared fields", () => {
    expect(
      pickExecutableParams(
        { amount: "1", currency: "RWF", noise: true, product: "retail_loan" },
        ["amount", "currency", "beneficiary_account", "product"],
      ),
    ).toEqual({ amount: "1", currency: "RWF", product: "retail_loan" });
  });

  it("names differing fields", () => {
    const mismatched = diffExecutableParams(params, {
      ...params,
      amount: "999.00",
      beneficiary_account: "ACCT-OTHER",
    });
    expect(mismatched.map((m) => m.field)).toEqual(["amount", "beneficiary_account"]);
  });
});

describe("sign/verify decision token", () => {
  it("round-trips", async () => {
    const keys = await generateKeyPair();
    const unsigned = buildDecisionToken({
      tenant: "11111111-1111-4111-8111-111111111111",
      case_id: "LN-1",
      decision_id: "dec_1",
      action_type: "loan.disburse",
      params,
      key_id: "receipt_dev",
      issued_at: "2026-11-18T10:00:00.000Z",
      expires_at: "2026-11-18T11:00:00.000Z",
      nonce: "AAECAwQFBgcICQoLDA0ODw",
      token_id: "dtk_test0000000001",
    });
    const signed = await signDecisionToken(unsigned, keys.privateKey);
    expect(signed.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(tokenSignatureInputHex(signed)).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await verifyDecisionToken(signed, keys.publicKey, {
        now: new Date("2026-11-18T10:30:00.000Z"),
      }),
    ).toEqual({ ok: true });
  });

  it("rejects tampered and expired tokens", async () => {
    const keys = await generateKeyPair();
    const signed = await signDecisionToken(
      buildDecisionToken({
        tenant: "org",
        case_id: "c1",
        decision_id: "d1",
        action_type: "loan.disburse",
        params,
        key_id: "k1",
        issued_at: "2026-11-18T10:00:00.000Z",
        expires_at: "2026-11-18T10:05:00.000Z",
      }),
      keys.privateKey,
    );
    expect(
      await verifyDecisionToken(signed, keys.publicKey, {
        now: new Date("2026-11-18T10:06:00.000Z"),
      }),
    ).toMatchObject({ ok: false, reason: "expired" });

    const tampered = { ...signed, case_id: "other" };
    expect(
      await verifyDecisionToken(tampered, keys.publicKey, {
        now: new Date("2026-11-18T10:01:00.000Z"),
      }),
    ).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
  });
});

describe("checkToken (offline)", () => {
  it("agrees on match and names field mismatches", async () => {
    const keys = await generateKeyPair();
    const signed = await signDecisionToken(
      buildDecisionToken({
        tenant: "org",
        case_id: "c1",
        decision_id: "d1",
        action_type: "loan.disburse",
        params,
        key_id: "k1",
        ttl_sec: 3600,
      }),
      keys.privateKey,
    );
    expect(await checkToken(signed, params, keys.publicKey)).toEqual({
      ok: true,
      params_hash: paramsHash(params),
    });
    const bad = await checkToken(
      signed,
      { ...params, currency: "USD" },
      keys.publicKey,
      { authorisedParams: params },
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("field_mismatch");
      expect(bad.mismatched_fields?.map((m) => m.field)).toEqual(["currency"]);
    }
  });
});

describe("resolveOnAegisUnavailable", () => {
  it("defaults to allow_and_flag; block refuses", () => {
    expect(resolveOnAegisUnavailable(undefined)).toEqual({
      proceed: true,
      flag: true,
      policy: "allow_and_flag",
    });
    expect(resolveOnAegisUnavailable("allow_and_flag")).toEqual({
      proceed: true,
      flag: true,
      policy: "allow_and_flag",
    });
    expect(resolveOnAegisUnavailable("block")).toEqual({
      proceed: false,
      flag: false,
      policy: "block",
    });
  });
});
