import * as ed from "@noble/ed25519";
import { describe, expect, it, vi } from "vitest";
import {
  buildEvidenceBundle,
  readTrustedTime,
  trustedTimeText,
  verifyBundleFile,
  type EvidenceTrustedTime,
} from "../src/forensic/evidence-bundle.js";
import { nextAttemptDelaySeconds, requestReceiptStamp } from "../src/forensic/receipt-timestamp.js";
import {
  buildReceiptBody,
  signForensicReceipt,
  type SignedForensicReceipt,
} from "../src/forensic/receipt.js";
import {
  getTsaConfig,
  parseRfc3161Reply,
  tsaAuthorityName,
} from "../src/forensic/tsa.js";
import { buildTimeStampResp, tsaFetch } from "./tsa-fixture.js";

const HASH_HEX = "ab".repeat(32);
const SECTIGO = { url: "http://timestamp.sectigo.com", authority: "Sectigo" };

describe("TSA configuration", () => {
  it("is off without AEGIS_TSA_URL and names well-known authorities", () => {
    expect(getTsaConfig({})).toBeNull();
    expect(getTsaConfig({ AEGIS_TSA_URL: "http://timestamp.sectigo.com" })).toEqual(SECTIGO);
    expect(tsaAuthorityName("https://freetsa.org/tsr", {})).toBe("FreeTSA");
    expect(tsaAuthorityName("https://tsa.bank.example/ts", {})).toBe("tsa.bank.example");
    expect(
      tsaAuthorityName("https://tsa.bank.example/ts", { AEGIS_TSA_NAME: "Bank TSA" }),
    ).toBe("Bank TSA");
  });
});

describe("RFC 3161 reply reader", () => {
  it("reads genTime and the message imprint from a granted reply", () => {
    const reply = buildTimeStampResp({
      hashHex: HASH_HEX,
      genTime: new Date("2026-11-16T05:40:41Z"),
    });
    expect(parseRfc3161Reply(reply)).toEqual({
      ok: true,
      gen_time: "2026-11-16T05:40:41.000Z",
      message_hash_hex: HASH_HEX,
    });
  });

  it("reports a rejected request and garbage plainly", () => {
    const rejected = parseRfc3161Reply(
      buildTimeStampResp({ hashHex: HASH_HEX, genTime: new Date(), status: 2 }),
    );
    expect(rejected).toMatchObject({ ok: false });
    expect((rejected as { error: string }).error).toMatch(/rejected/);
    expect(parseRfc3161Reply(Buffer.from([1, 2, 3]))).toMatchObject({ ok: false });
    expect(parseRfc3161Reply(Buffer.alloc(0))).toMatchObject({ ok: false });
  });
});

describe("requestReceiptStamp: success, failure, imprint check", () => {
  const genTime = new Date("2026-11-16T05:40:41Z");

  it("success: stamped with the authority time", async () => {
    const fetchImpl = tsaFetch({ genTime });
    const result = await requestReceiptStamp(`sha256:${HASH_HEX}`, SECTIGO, { fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      gen_time_utc: "2026-11-16T05:40:41.000Z",
      authority: "Sectigo",
      tsa_url: SECTIGO.url,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(SECTIGO.url);
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/timestamp-query",
    });
  });

  it("failure: unreachable TSA gives an error, never throws", async () => {
    const fetchImpl = tsaFetch({ genTime, failTimes: 99 });
    const result = await requestReceiptStamp(`sha256:${HASH_HEX}`, SECTIGO, { fetchImpl });
    expect(result).toEqual({ ok: false, error: "connect ECONNREFUSED" });
  });

  it("failure: HTTP error from the TSA", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "busy",
    })) as unknown as typeof fetch;
    const result = await requestReceiptStamp(`sha256:${HASH_HEX}`, SECTIGO, { fetchImpl });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/TSA HTTP 503/);
  });

  it("failure: a token for a different hash is refused", async () => {
    const wrong = buildTimeStampResp({ hashHex: "cd".repeat(32), genTime });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        wrong.buffer.slice(wrong.byteOffset, wrong.byteOffset + wrong.byteLength),
      text: async () => "",
    })) as unknown as typeof fetch;
    const result = await requestReceiptStamp(`sha256:${HASH_HEX}`, SECTIGO, { fetchImpl });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/different hash/);
  });

  it("failure: a TSA rejection (PKIStatus 2) is refused", async () => {
    const fetchImpl = tsaFetch({ genTime, status: 2 });
    const result = await requestReceiptStamp(`sha256:${HASH_HEX}`, SECTIGO, { fetchImpl });
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/rejected/);
  });

  it("retry backoff grows and is capped at one hour", () => {
    expect(nextAttemptDelaySeconds(1)).toBe(15);
    expect(nextAttemptDelaySeconds(2)).toBe(30);
    expect(nextAttemptDelaySeconds(3)).toBe(60);
    expect(nextAttemptDelaySeconds(30)).toBe(3600);
  });
});

describe("Verify shows trusted time (amber while pending, never green)", () => {
  async function signedReceipt(): Promise<{
    receipt: SignedForensicReceipt;
    pub: string;
  }> {
    const seed = ed.utils.randomPrivateKey();
    const pub = Buffer.from(await ed.getPublicKeyAsync(seed)).toString("base64");
    const receipt = await signForensicReceipt(
      buildReceiptBody({
        organization_id: "00000000-0000-0000-0000-000000000001",
        seq: 1,
        prev_hash: null,
        case_id: "case-1",
        decision_id: "dec-1",
        outcome: "allow",
        mode: "enforce",
        matched_rules: [],
        sealed_events: [{ event_id: "evt_1", event_hash: "sha256:a", sequence_num: 1 }],
        key_id: "key_tt",
      }),
      Buffer.from(seed).toString("base64"),
    );
    return { receipt, pub };
  }

  async function stampFor(receipt: SignedForensicReceipt, genTime: Date): Promise<EvidenceTrustedTime> {
    const hashHex = receipt.receipt_hash.replace("sha256:", "");
    const reply = buildTimeStampResp({ hashHex, genTime });
    return {
      receipt_id: receipt.receipt_id,
      status: "stamped",
      authority: "Sectigo",
      gen_time_utc: genTime.toISOString(),
      tsa_url: SECTIGO.url,
      message_hash: receipt.receipt_hash,
      token_b64: reply.toString("base64"),
    };
  }

  const timeCheck = (checks: Array<{ id: string }>) =>
    checks.find((c) => c.id === "trusted_time") as
      | { label: string; status: string; detail?: string }
      | undefined;

  it("stamped: 'Trusted time: <authority> at <UTC>' and pass", async () => {
    const { receipt, pub } = await signedReceipt();
    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "trc_1",
      receipts: [receipt],
      keys: { key_tt: pub },
      trusted_time: [await stampFor(receipt, new Date("2026-11-16T05:40:41Z"))],
    });
    const result = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(result.ok).toBe(true);
    const check = timeCheck(result.checks)!;
    expect(check.label).toBe("Trusted time: Sectigo at 2026-11-16 05:40:41 UTC");
    expect(check.status).toBe("pass");
    expect(trustedTimeText(bundle, receipt.receipt_id)).toBe(
      "Trusted time: Sectigo at 2026-11-16 05:40:41 UTC",
    );
  });

  it("pending: amber (pending), not green, and the bundle is still valid", async () => {
    const { receipt, pub } = await signedReceipt();
    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "trc_1",
      receipts: [receipt],
      keys: { key_tt: pub },
      trusted_time: [
        {
          receipt_id: receipt.receipt_id,
          status: "pending",
          authority: null,
          gen_time_utc: null,
          tsa_url: null,
          message_hash: receipt.receipt_hash,
          token_b64: null,
        },
      ],
    });
    const result = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(result.ok).toBe(true);
    const check = timeCheck(result.checks)!;
    expect(check.status).toBe("pending");
    expect(check.status).not.toBe("pass");
    expect(check.label).toBe("Trusted time: pending");
    expect(trustedTimeText(bundle, receipt.receipt_id)).toMatch(/pending/);
  });

  it("edited stamp: genTime changed in the file fails verification", async () => {
    const { receipt, pub } = await signedReceipt();
    const stamp = await stampFor(receipt, new Date("2026-11-16T05:40:41Z"));
    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "trc_1",
      receipts: [receipt],
      keys: { key_tt: pub },
      trusted_time: [{ ...stamp, gen_time_utc: "2025-01-01T00:00:00.000Z" }],
    });
    expect(readTrustedTime(bundle)[0]?.status).toBe("invalid");
    const result = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("timestamp_invalid");
    expect(timeCheck(result.checks)!.status).toBe("fail");
  });

  it("stamp for another receipt hash is invalid", async () => {
    const { receipt, pub } = await signedReceipt();
    const other = await stampFor(
      { ...receipt, receipt_hash: `sha256:${"cd".repeat(32)}` },
      new Date("2026-11-16T05:40:41Z"),
    );
    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "trc_1",
      receipts: [receipt],
      keys: { key_tt: pub },
      trusted_time: [{ ...other, receipt_id: receipt.receipt_id }],
    });
    expect(readTrustedTime(bundle)[0]?.status).toBe("invalid");
  });

  it("no TSA configured: the old signed-time wording, no amber", async () => {
    const { receipt, pub } = await signedReceipt();
    const bundle = buildEvidenceBundle({
      organization_id: receipt.organization_id,
      trace_id: "trc_1",
      receipts: [receipt],
      keys: { key_tt: pub },
    });
    const result = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    const check = timeCheck(result.checks)!;
    expect(check.label).toBe("Signed time recorded");
    expect(check.status).toBe("pass");
  });
});
