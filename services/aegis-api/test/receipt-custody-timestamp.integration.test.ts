/**
 * Integration (real Postgres): receipt signing custody and trusted-time queue.
 *
 *  - KMS (mock client with real AWS shapes) signs receipts in production mode;
 *    custody is signed into the receipt and published at /v1/public/keys.
 *  - interim software key: receipts and Verify say "Key custody: software key (interim)".
 *  - production refuses software keys without the interim flag.
 *  - trusted time: queued with the receipt, stamped on success, retried after
 *    failure, and the receipt is issued regardless.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as ed from "@noble/ed25519";
import "../src/db/load-env.js";
import { createApp } from "../src/app.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  ED25519_SPKI_PREFIX,
  KmsEd25519Signer,
  resetReceiptKmsSignerForTests,
  type KmsClientLike,
} from "../src/crypto/kms-ed25519.js";
import { GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import { ReceiptSigningError } from "../src/crypto/receipt-signing.js";
import {
  buildEvidenceBundle,
  verifyBundleFile,
} from "../src/forensic/evidence-bundle.js";
import { issueForensicReceipt } from "../src/forensic/issue.js";
import {
  getReceiptTimestamps,
  processPendingTimestamps,
  scheduleReceiptTimestamp,
  stampReceiptNow,
} from "../src/forensic/receipt-timestamp.js";
import {
  listPublishedReceiptKeys,
  publishReceiptSigningKey,
  resetPublishedReceiptKeyCacheForTests,
} from "../src/repo/receipt-keys.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { tsaFetch } from "./tsa-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const ORG = INTEGRATION_ORG_A;
const ARN =
  "arn:aws:kms:eu-west-1:111122223333:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const KEYS = [
  "AEGIS_ENV",
  "AEGIS_DEMO_MODE",
  "AEGIS_RECEIPT_KMS_KEY_ID",
  "AEGIS_RECEIPT_KEY_ID",
  "AEGIS_RECEIPT_SIGNING_KEY_B64",
  "AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION",
  "AEGIS_TSA_URL",
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function restoreEnv() {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

function kmsMock() {
  const seed = ed.utils.randomPrivateKey();
  const calls: string[] = [];
  const client: KmsClientLike = {
    async send(command: unknown) {
      if (command instanceof GetPublicKeyCommand) {
        calls.push("GetPublicKey");
        return {
          PublicKey: Buffer.concat([ED25519_SPKI_PREFIX, await ed.getPublicKeyAsync(seed)]),
          KeySpec: "ECC_NIST_EDWARDS25519",
          KeyUsage: "SIGN_VERIFY",
          SigningAlgorithms: ["ED25519_SHA_512"],
        };
      }
      if (command instanceof SignCommand) {
        calls.push("Sign");
        expect(command.input.MessageType).toBe("RAW");
        expect(command.input.SigningAlgorithm).toBe("ED25519_SHA_512");
        return { Signature: await ed.signAsync(command.input.Message as Uint8Array, seed) };
      }
      throw new Error("unexpected command");
    },
  };
  return { client, calls, seed };
}

function receiptInput(tag: string) {
  return {
    organization_id: ORG,
    case_id: `case_cust_${tag}_${randomUUID().slice(0, 6)}`,
    decision_id: `dec_cust_${tag}`,
    outcome: "allow",
    mode: "enforce" as const,
    matched_rules: [],
    sealed_events: [
      {
        event_id: `evt_cust_${tag}_${randomUUID().slice(0, 8)}`,
        event_hash: `sha256:${tag}`,
        sequence_num: 1,
      },
    ],
  };
}

describeIfDb("receipt key custody and trusted time (integration)", () => {
  beforeAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
  });

  afterEach(async () => {
    restoreEnv();
    resetReceiptKmsSignerForTests(null);
    resetPublishedReceiptKeyCacheForTests();
    await getPool().query(
      `DELETE FROM receipt_signing_key WHERE key_id LIKE 'cust_test_%' OR key_id LIKE 'kms_%'`,
    );
    await getPool().query(
      `DELETE FROM forensic_receipt_timestamp WHERE receipt_id LIKE 'rcpt_tt_%'`,
    );
  });

  afterAll(async () => {
    restoreEnv();
    await closePool();
  });

  it("KMS: production receipts are KMS-signed, custody is signed in, key is published", async () => {
    const kms = kmsMock();
    process.env.AEGIS_ENV = "production";
    delete process.env.AEGIS_DEMO_MODE;
    process.env.AEGIS_RECEIPT_KMS_KEY_ID = ARN;
    process.env.AEGIS_RECEIPT_KEY_ID = "cust_test_kms_1";
    delete process.env.AEGIS_RECEIPT_SIGNING_KEY_B64;
    resetReceiptKmsSignerForTests({
      keyId: ARN,
      signer: new KmsEd25519Signer({ keyId: ARN, client: kms.client }),
    });

    const receipt = await issueForensicReceipt(getPool(), receiptInput("kms"));
    expect(receipt.key_id).toBe("cust_test_kms_1");
    expect(receipt.flags?.key_custody).toBe("kms");
    expect(kms.calls).toContain("Sign");

    const published = await listPublishedReceiptKeys(getPool());
    const row = published.find((k) => k.key_id === "cust_test_kms_1")!;
    expect(row.custody).toBe("kms");
    expect(row.public_key_b64).toBe(
      Buffer.from(await ed.getPublicKeyAsync(kms.seed)).toString("base64"),
    );

    const app = createApp();
    const res = await app.request("/v1/public/keys");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      keys: Array<{
        key_id: string;
        public_key_b64: string;
        custody: string;
        fingerprint: string;
        kms?: Record<string, string>;
      }>;
    };
    const pub = body.keys.find((k) => k.key_id === "cust_test_kms_1")!;
    expect(pub.custody).toBe("kms");
    expect(pub.kms).toEqual({
      provider: "aws",
      key_spec: "ECC_NIST_EDWARDS25519",
      signing_algorithm: "ED25519_SHA_512",
      message_type: "RAW",
    });
    expect(JSON.stringify(body)).not.toContain("111122223333"); // no ARN / account id

    const flat = (await (await app.request("/v1/public/keys.json")).json()) as Record<
      string,
      string
    >;
    expect(flat["cust_test_kms_1"]).toBe(pub.public_key_b64);

    // the bundle carries the key, its custody, and verifies as KMS custody
    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "trc_custody",
      receipts: [receipt],
      keys: { cust_test_kms_1: pub.public_key_b64 },
      key_custody: {
        cust_test_kms_1: { custody: "kms", label: "Key custody: AWS KMS" },
      },
    });
    expect(bundle.key_custody?.cust_test_kms_1?.custody).toBe("kms");
    const verified = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(verified.ok).toBe(true);
    expect(verified.checks.find((c) => c.id === "key_custody")).toMatchObject({
      label: "Key custody: AWS KMS",
      status: "pass",
    });
  });

  it("interim: receipts and Verify say 'Key custody: software key (interim)'", async () => {
    const seed = ed.utils.randomPrivateKey();
    process.env.AEGIS_ENV = "production";
    delete process.env.AEGIS_RECEIPT_KMS_KEY_ID;
    process.env.AEGIS_RECEIPT_KEY_ID = "cust_test_interim_1";
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = Buffer.from(seed).toString("base64");
    process.env.AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION = "interim";

    const receipt = await issueForensicReceipt(getPool(), receiptInput("interim"));
    expect(receipt.flags?.key_custody).toBe("software_interim");
    const row = (await listPublishedReceiptKeys(getPool())).find(
      (k) => k.key_id === "cust_test_interim_1",
    )!;
    expect(row.custody).toBe("software_interim");

    const bundle = buildEvidenceBundle({
      organization_id: ORG,
      trace_id: "trc_interim",
      receipts: [receipt],
      keys: { cust_test_interim_1: row.public_key_b64 },
    });
    const verified = await verifyBundleFile(JSON.parse(JSON.stringify(bundle)));
    expect(verified.ok).toBe(true);
    const check = verified.checks.find((c) => c.id === "key_custody")!;
    expect(check.label).toBe("Key custody: software key (interim)");
    expect(check.status).toBe("info");
  });

  it("production refuses a software key without the interim flag, and overrides", async () => {
    process.env.AEGIS_ENV = "production";
    delete process.env.AEGIS_RECEIPT_KMS_KEY_ID;
    process.env.AEGIS_RECEIPT_KEY_ID = "cust_test_nointerim";
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = Buffer.from(
      ed.utils.randomPrivateKey(),
    ).toString("base64");
    delete process.env.AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION;
    await expect(
      issueForensicReceipt(getPool(), receiptInput("nointerim")),
    ).rejects.toBeInstanceOf(ReceiptSigningError);

    process.env.AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION = "interim";
    await expect(
      issueForensicReceipt(getPool(), {
        ...receiptInput("override"),
        signingKey: {
          key_id: "cust_test_override",
          private_key_b64: Buffer.from(ed.utils.randomPrivateKey()).toString("base64"),
        },
      }),
    ).rejects.toThrow(/override is refused in production/);

    process.env.AEGIS_RECEIPT_KEY_ID = "receipt_dev";
    await expect(
      issueForensicReceipt(getPool(), receiptInput("devkey")),
    ).rejects.toThrow(/receipt_dev/);
  });

  it("a published production key id can never be re-pointed at another key", async () => {
    const a = kmsMock();
    const b = kmsMock();
    const signing = (kms: ReturnType<typeof kmsMock>) => {
      const signer = new KmsEd25519Signer({ keyId: ARN, client: kms.client });
      return {
        key_id: "cust_test_pin",
        custody: "kms" as const,
        publicKeyB64: () => signer.getPublicKeyB64(),
      };
    };
    await publishReceiptSigningKey(getPool(), signing(a));
    resetPublishedReceiptKeyCacheForTests();
    await expect(publishReceiptSigningKey(getPool(), signing(b))).rejects.toThrow(
      /already published with a different public key/,
    );
  });

  it("dev software keys do not publish custody flags and can be re-pointed", async () => {
    delete process.env.AEGIS_ENV;
    delete process.env.AEGIS_RECEIPT_KMS_KEY_ID;
    process.env.AEGIS_RECEIPT_KEY_ID = "cust_test_dev";
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = Buffer.from(
      ed.utils.randomPrivateKey(),
    ).toString("base64");
    const r1 = await issueForensicReceipt(getPool(), receiptInput("dev1"));
    expect(r1.flags?.key_custody).toBeUndefined();
    resetPublishedReceiptKeyCacheForTests();
    process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = Buffer.from(
      ed.utils.randomPrivateKey(),
    ).toString("base64");
    const r2 = await issueForensicReceipt(getPool(), receiptInput("dev2"));
    expect(r2.seq).toBeGreaterThan(r1.seq);
  });
});

describeIfDb("trusted time queue (integration)", () => {
  const genTime = new Date("2026-11-16T05:40:41Z");
  const env = { AEGIS_TSA_URL: "http://timestamp.sectigo.com" } as NodeJS.ProcessEnv;

  beforeAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
  });

  afterEach(async () => {
    restoreEnv();
    await getPool().query(
      `DELETE FROM forensic_receipt_timestamp WHERE receipt_id LIKE 'rcpt_tt_%'`,
    );
  });

  afterAll(async () => {
    restoreEnv();
    await closePool();
  });

  async function queue(id: string) {
    const hash = `sha256:${"ab".repeat(32)}`;
    await scheduleReceiptTimestamp(
      getPool(),
      { receipt_id: id, organization_id: ORG, receipt_hash: hash },
      env,
    );
    return hash;
  }

  it("does nothing when no TSA is configured", async () => {
    const result = await scheduleReceiptTimestamp(
      getPool(),
      { receipt_id: "rcpt_tt_off", organization_id: ORG, receipt_hash: "sha256:00" },
      {},
    );
    expect(result).toBe("disabled");
    expect(await getReceiptTimestamps(getPool(), ORG, ["rcpt_tt_off"])).toEqual([]);
  });

  it("success: queued receipt is stamped with authority and genTime", async () => {
    const id = "rcpt_tt_ok";
    const hash = await queue(id);
    expect((await getReceiptTimestamps(getPool(), ORG, [id]))[0]).toMatchObject({
      status: "pending",
      attempts: 0,
    });
    const fetchImpl = tsaFetch({ genTime });
    const result = await stampReceiptNow(getPool(), id, { env, fetchImpl });
    expect(result).toEqual({ attempted: 1, stamped: 1, failed: 0 });
    const row = (await getReceiptTimestamps(getPool(), ORG, [id]))[0]!;
    expect(row).toMatchObject({
      status: "stamped",
      authority: "Sectigo",
      gen_time_utc: "2026-11-16T05:40:41.000Z",
      message_hash: hash,
      last_error: null,
    });
    expect(row.token_b64).toBeTruthy();
    // stamped rows are not picked up again
    expect(await processPendingTimestamps(getPool(), { env, fetchImpl })).toEqual({
      attempted: 0,
      stamped: 0,
      failed: 0,
    });
  });

  it("failure then retry: stays pending with backoff, then stamps when the TSA is back", async () => {
    const id = "rcpt_tt_retry";
    await queue(id);
    const fetchImpl = tsaFetch({ genTime, failTimes: 1 });

    const first = await stampReceiptNow(getPool(), id, { env, fetchImpl });
    expect(first).toEqual({ attempted: 1, stamped: 0, failed: 1 });
    const pending = (await getReceiptTimestamps(getPool(), ORG, [id]))[0]!;
    expect(pending.status).toBe("pending");
    expect(pending.attempts).toBe(1);
    expect(pending.last_error).toMatch(/ECONNREFUSED/);

    // not due yet: backoff holds it back, so the loop does not hammer the TSA
    expect(await processPendingTimestamps(getPool(), { env, fetchImpl })).toEqual({
      attempted: 0,
      stamped: 0,
      failed: 0,
    });
    const due = await getPool().query<{ wait: number }>(
      `SELECT EXTRACT(EPOCH FROM (next_attempt_at - now()))::float AS wait
       FROM forensic_receipt_timestamp WHERE receipt_id = $1`,
      [id],
    );
    expect(due.rows[0]!.wait).toBeGreaterThan(5);

    // TSA recovers; the retry stamps it
    const second = await stampReceiptNow(getPool(), id, { env, fetchImpl });
    expect(second).toEqual({ attempted: 1, stamped: 1, failed: 0 });
    const done = (await getReceiptTimestamps(getPool(), ORG, [id]))[0]!;
    expect(done.status).toBe("stamped");
    expect(done.attempts).toBe(2);
    expect(done.last_error).toBeNull();
  });

  it("the receipt is issued even when the TSA is down (stamp stays pending)", async () => {
    process.env.AEGIS_TSA_URL = "http://tsa.down.invalid/ts";
    delete process.env.AEGIS_ENV;
    const seed = ed.utils.randomPrivateKey();
    const receipt = await issueForensicReceipt(getPool(), {
      organization_id: ORG,
      case_id: `case_tt_${randomUUID().slice(0, 8)}`,
      decision_id: "dec_tt",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: `evt_tt_${randomUUID().slice(0, 8)}`, event_hash: "sha256:tt", sequence_num: 1 },
      ],
      signingKey: {
        key_id: "cust_test_tt",
        private_key_b64: Buffer.from(seed).toString("base64"),
      },
    });
    expect(receipt.receipt_hash).toMatch(/^sha256:/);
    const rows = await getReceiptTimestamps(getPool(), ORG, [receipt.receipt_id]);
    expect(rows[0]).toMatchObject({ status: "pending", message_hash: receipt.receipt_hash });

    // the TSA being unreachable never loses the receipt
    const failing = tsaFetch({ genTime, failTimes: 99 });
    const result = await stampReceiptNow(getPool(), receipt.receipt_id, {
      env: { AEGIS_TSA_URL: "http://tsa.down.invalid/ts" },
      fetchImpl: failing,
    });
    expect(result.failed).toBe(1);
    const stillThere = await getPool().query(
      `SELECT 1 FROM forensic_receipt WHERE receipt_id = $1`,
      [receipt.receipt_id],
    );
    expect(stillThere.rowCount).toBe(1);
    await getPool().query(`DELETE FROM forensic_receipt_timestamp WHERE receipt_id = $1`, [
      receipt.receipt_id,
    ]);
  });
});
