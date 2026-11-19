/**
 * Stage 1 provenance: source registry + AEGIS-SRC1 signed envelope ingest.
 * Real Postgres, real HTTP app (createApp), real SDK signing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  buildEnvelope,
  generateKeyPair,
  signEnvelope,
  type BusinessEvent,
  type KeyPair,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import "../src/db/load-env.js";
import { createApp } from "../src/app.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { isReceiptSigningConfigured } from "../src/crypto/receipt-signing.js";
import {
  addSourceKey,
  disableSource,
  registerSource,
  revokeSourceKey,
} from "../src/sources/registry.js";
import { verifyAndAcceptEnvelope } from "../src/sources/verify-and-accept.js";
import { gradeForDecision } from "../src/sources/grade.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import {
  ensureDevBridgeKey,
  ensureDevIngestKey,
  ensureDevSigningKey,
} from "./helpers.js";
import { insertTestAdmin } from "./insert-test-admin.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const AGENT = "agent-dev-01";
const KEY = "key-dev-01";
const INGEST = process.env.AEGIS_INGEST_DEV_KEY ?? "aegis_dev_local_change_me";
const privateKeyB64 =
  process.env.DEV_SIGNING_PRIVATE_KEY_B64 ??
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";
const ADMIN_PASSWORD = "source-test-password-123";

const MIN = 60_000;
const HOUR = 60 * MIN;

type Src = { sourceId: string; keyId: string; kp: KeyPair };

const SOURCE_TABLES = [
  "source_envelope_idempotency",
  "source_sequence_gap",
  "source_nonce",
  "source_registry_event",
  "source_key",
  "source",
  "organization_setting_change",
];

function businessEvent(): BusinessEvent {
  return {
    schema_version: 1,
    case_id: `case-${randomUUID()}`,
    idempotency_key: randomUUID(),
    event_type: "generic",
    emitted_at: new Date().toISOString(),
    attributes: { amount: "100.00", currency: "EUR" },
  };
}

describeIfDb("source registry + signed envelope ingest (Stage 1)", () => {
  const app = createApp();
  const saved: Record<string, string | undefined> = {};
  let adminCookie = "";
  let viewerCookie = "";
  const createdAccounts: string[] = [];

  async function cleanup(): Promise<void> {
    const pool = getPool();
    for (const t of SOURCE_TABLES) {
      await pool.query(`DELETE FROM ${t} WHERE organization_id = $1`, [ORG]);
    }
    await pool.query(
      `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
      [ORG],
    );
  }

  async function login(email: string): Promise<string> {
    const res = await app.request("/v1/console/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: ADMIN_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const match = (res.headers.get("set-cookie") ?? "").match(/aegis_session=([^;]+)/);
    expect(match).toBeTruthy();
    return `aegis_session=${match![1]}`;
  }

  beforeAll(async () => {
    for (const k of [
      "INGEST_RATE_LIMIT_PER_MIN",
      "AEGIS_SOURCE_TS_SKEW_SEC",
      "AEGIS_RECEIPT_SIGNING_KEY_B64",
      "AEGIS_RECEIPT_KEY_ID",
    ]) {
      saved[k] = process.env[k];
    }
    process.env.INGEST_RATE_LIMIT_PER_MIN = "100000";
    delete process.env.AEGIS_SOURCE_TS_SKEW_SEC;
    if (!isReceiptSigningConfigured()) {
      process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = (await generateKeyPair()).privateKeyB64;
      process.env.AEGIS_RECEIPT_KEY_ID = "receipt_source_test";
    }

    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevIngestKey(pool, INGEST, ORG);
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await ensureDevBridgeKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await cleanup();

    const admin = await insertTestAdmin(pool, {
      organizationId: ORG,
      password: ADMIN_PASSWORD,
    });
    createdAccounts.push(admin.accountId);
    adminCookie = await login(admin.email);

    // A viewer in the same org (insertTestAdmin always makes admins).
    const viewerAccount = randomUUID();
    const viewerEmail = `vitest-${viewerAccount.replace(/-/g, "")}@local.invalid`;
    const adminRow = await pool.query<{ password_hash: string }>(
      `SELECT password_hash FROM account WHERE account_id = $1`,
      [admin.accountId],
    );
    await pool.query(
      `INSERT INTO account (account_id, email, display_name, password_hash, email_verified_at, active)
       VALUES ($1, $2, 'Vitest viewer', $3, now(), true)`,
      [viewerAccount, viewerEmail, adminRow.rows[0]!.password_hash],
    );
    await pool.query(
      `INSERT INTO membership (membership_id, account_id, organization_id, role, status)
       VALUES ($1, $2, $3, 'viewer', 'active')`,
      [randomUUID(), viewerAccount, ORG],
    );
    createdAccounts.push(viewerAccount);
    viewerCookie = await login(viewerEmail);
  });

  afterAll(async () => {
    try {
      await cleanup();
      const pool = getPool();
      await pool.query(`DELETE FROM session WHERE account_id = ANY($1::uuid[])`, [
        createdAccounts,
      ]);
      await pool.query(`DELETE FROM membership WHERE account_id = ANY($1::uuid[])`, [
        createdAccounts,
      ]);
      await pool.query(`DELETE FROM account WHERE account_id = ANY($1::uuid[])`, [
        createdAccounts,
      ]);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      await closePool();
    }
  });

  // ---------------------------------------------------------------- helpers
  async function newSource(opts?: {
    validFrom?: Date;
    kind?: string;
  }): Promise<Src> {
    const kp = await generateKeyPair();
    const sourceId = `src-${randomUUID().slice(0, 8)}`;
    const keyId = `key-${randomUUID().slice(0, 8)}`;
    const client = await getPool().connect();
    try {
      await registerSource(client, {
        organization_id: ORG,
        source_id: sourceId,
        name: `Test ${sourceId}`,
        kind: opts?.kind ?? "application",
        owner_contact: "ops@example.test",
        key_id: keyId,
        public_key_b64: kp.publicKeyB64,
        valid_from: opts?.validFrom ?? new Date(Date.now() - HOUR),
        actor: "vitest",
      });
    } finally {
      client.release();
    }
    return { sourceId, keyId, kp };
  }

  async function signed(
    src: Src,
    seq: number,
    o: {
      ts?: Date;
      nonce?: string;
      idempotency_key?: string;
      event?: BusinessEvent;
      signWith?: KeyPair;
      keyId?: string;
      sourceId?: string;
    } = {},
  ): Promise<SignedEnvelope> {
    const baseEvent = o.event ?? businessEvent();
    const event =
      o.idempotency_key !== undefined
        ? { ...baseEvent, idempotency_key: o.idempotency_key }
        : baseEvent;
    const unsigned = buildEnvelope({
      source_id: o.sourceId ?? src.sourceId,
      key_id: o.keyId ?? src.keyId,
      seq,
      ts: o.ts,
      nonce: o.nonce,
      idempotency_key: o.idempotency_key,
      event,
    });
    return signEnvelope(unsigned, (o.signWith ?? src.kp).privateKey);
  }

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return app.request(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INGEST}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  const ingest = (env: unknown) => post("/v1/aegis/source-events", env);

  async function expectRejected(
    res: Response,
    status: number,
    code: string,
  ): Promise<void> {
    const body = (await res.json()) as { error: string; code: string; message: string };
    expect({ status: res.status, code: body.code }).toEqual({ status, code });
    expect(body.error).toBe("envelope_rejected");
    expect(body.message.length).toBeGreaterThan(10);
  }

  async function sourceRow(src: Src) {
    const r = await getPool().query<{ last_seq: string; last_event_at: Date | null }>(
      `SELECT last_seq::text, last_event_at FROM source
       WHERE organization_id = $1 AND source_id = $2`,
      [ORG, src.sourceId],
    );
    return { last_seq: Number(r.rows[0]!.last_seq), last_event_at: r.rows[0]!.last_event_at };
  }

  async function gaps(src: Src): Promise<Array<[number, number]>> {
    const r = await getPool().query<{ from_seq: string; to_seq: string }>(
      `SELECT from_seq::text, to_seq::text FROM source_sequence_gap
       WHERE organization_id = $1 AND source_id = $2 ORDER BY from_seq`,
      [ORG, src.sourceId],
    );
    return r.rows.map((g) => [Number(g.from_seq), Number(g.to_seq)]);
  }

  function consoleReq(
    cookie: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return Promise.resolve(
      app.request(`/v1/console${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }

  // ------------------------------------------------------------ valid → G1
  it("valid envelope → 200, source_signed, evidence grade G1, sealed on receipt and event", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const res = await ingest(env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.source_signed).toBe(true);
    expect(body.evidence_grade).toBe("G1");
    expect(body.case_id).toBe(env.event.case_id);
    expect(typeof body.receipt_id).toBe("string");
    expect(typeof body.decision_id).toBe("string");
    expect(["allow", "hold", "stop"]).toContain(body.outcome);

    const row = await sourceRow(src);
    expect(row.last_seq).toBe(1);
    expect(row.last_event_at?.toISOString()).toBe(env.ts);

    // Full envelope (with signature) is on the forensic receipt.
    const receipt = await getPool().query<{ body: { attributes: Record<string, unknown> } }>(
      `SELECT body FROM forensic_receipt WHERE organization_id = $1 AND receipt_id = $2`,
      [ORG, body.receipt_id],
    );
    const attrs = receipt.rows[0]?.body.attributes ?? {};
    expect(attrs.source_envelope).toEqual(env);
    expect(attrs.source_id).toBe(src.sourceId);
    expect(attrs.source_key_id).toBe(src.keyId);
    expect(attrs.evidence_grade).toBe("G1");
    expect(attrs.checks).toEqual({ source_signed: true });
    expect(attrs.provenance).toEqual({ authentication: "source_signature", grade: "G1" });
    expect(attrs.require_signed_events_in_force).toBe(false);

    // ... and on the sealed APS event.
    const ev = await getPool().query<{ payload: { attributes: Record<string, unknown> } }>(
      `SELECT payload FROM event WHERE organization_id = $1 AND event_id = $2`,
      [ORG, body.event_id],
    );
    expect(ev.rows[0]?.payload.attributes.source_envelope).toEqual(env);
    expect(ev.rows[0]?.payload.attributes.evidence_grade).toBe("G1");
    expect(ev.rows[0]?.payload.attributes.require_signed_events_in_force).toBe(false);
  });

  it("an envelope posted to /governed/events and /bank/events takes the signed path", async () => {
    const src = await newSource();
    const a = await post("/v1/aegis/governed/events", await signed(src, 1));
    expect(a.status).toBe(200);
    expect(((await a.json()) as { evidence_grade: string }).evidence_grade).toBe("G1");
    const b = await post("/v1/aegis/bank/events", await signed(src, 2));
    expect(b.status).toBe(200);
    expect((await sourceRow(src)).last_seq).toBe(2);
  });

  it("gradeForDecision: G1 only when a source signature was verified", () => {
    expect(gradeForDecision({ source_signed: true })).toBe("G1");
    expect(gradeForDecision({ source_signed: false })).toBeNull();
  });

  // ------------------------------------------------------- auth / malformed
  it("source-events needs a valid ingest key", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const none = await app.request("/v1/aegis/source-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(env),
    });
    expect(none.status).toBe(401);
    const bad = await post("/v1/aegis/source-events", env, { Authorization: "Bearer nope" });
    expect(bad.status).toBe(401);
    expect((await sourceRow(src)).last_seq).toBe(0);
  });

  it("invalid JSON → 400; non-envelope bodies and unsupported versions are refused", async () => {
    const res = await app.request("/v1/aegis/source-events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${INGEST}` },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    await expectRejected(await ingest({ hello: "world" }), 400, "unsupported_version");
    await expectRejected(await ingest({ aegis_envelope: "2" }), 400, "unsupported_version");
    await expectRejected(await ingest({ aegis_envelope: "1" }), 400, "malformed");
    await expectRejected(await ingest([1, 2]), 400, "malformed");
  });

  it("known key but missing fields → malformed", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const { nonce: _nonce, ...withoutNonce } = env;
    await expectRejected(await ingest(withoutNonce), 400, "malformed");
    await expectRejected(await ingest({ ...env, extra: true }), 400, "malformed");
    expect((await sourceRow(src)).last_seq).toBe(0);
  });

  it("valid signature but event is not a decision request → 400, sequence not consumed", async () => {
    const src = await newSource();
    const bad: BusinessEvent = { ...businessEvent(), case_id: "" };
    const res = await ingest(await signed(src, 1, { event: bad }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toBe("validation_error");
    expect((await sourceRow(src)).last_seq).toBe(0);
    // The same seq can still be used for a corrected event.
    expect((await ingest(await signed(src, 1))).status).toBe(200);
  });

  // ------------------------------------------------------------ signatures
  it("forged signature → 401 bad_signature", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const first = env.signature[0] === "A" ? "B" : "A";
    const forged = { ...env, signature: first + env.signature.slice(1) };
    await expectRejected(await ingest(forged), 401, "bad_signature");
    expect((await sourceRow(src)).last_seq).toBe(0);
  });

  it("event changed after signing → 401 event_hash_mismatch", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const tampered = {
      ...env,
      event: { ...env.event, attributes: { amount: "999999.00", currency: "EUR" } },
    };
    await expectRejected(await ingest(tampered), 401, "event_hash_mismatch");
  });

  it("envelope fields changed after signing (seq, ts, nonce) → 401 bad_signature", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    await expectRejected(await ingest({ ...env, seq: 2 }), 401, "bad_signature");
    await expectRejected(
      await ingest({ ...env, ts: new Date(Date.now() + 1000).toISOString() }),
      401,
      "bad_signature",
    );
  });

  it("signed by a different key than the registered one → 401 bad_signature", async () => {
    const src = await newSource();
    const stranger = await generateKeyPair();
    const env = await signed(src, 1, { signWith: stranger });
    await expectRejected(await ingest(env), 401, "bad_signature");
  });

  it("key registered to another source → 401 key_source_mismatch", async () => {
    const a = await newSource();
    const b = await newSource();
    const env = await signed(a, 1, { sourceId: b.sourceId });
    await expectRejected(await ingest(env), 401, "key_source_mismatch");
    expect((await sourceRow(b)).last_seq).toBe(0);
  });

  it("unknown key id → 401 unknown_key", async () => {
    const src = await newSource();
    const env = await signed(src, 1, { keyId: `nokey-${randomUUID().slice(0, 6)}` });
    await expectRejected(await ingest(env), 401, "unknown_key");
  });

  it("a key registered in another organisation is unknown here (org isolation)", async () => {
    const pool = getPool();
    const slug = `src-iso-${randomUUID().slice(0, 8)}`;
    const other = await pool.query<{ organization_id: string }>(
      `INSERT INTO organization (name, slug) VALUES ($1, $2) RETURNING organization_id`,
      [`Isolation ${slug}`, slug],
    );
    const otherOrg = other.rows[0]!.organization_id;
    const kp = await generateKeyPair();
    const client = await pool.connect();
    try {
      await registerSource(client, {
        organization_id: otherOrg,
        source_id: "foreign-source",
        name: "Foreign",
        kind: "application",
        key_id: `foreign-${slug}`,
        public_key_b64: kp.publicKeyB64,
        valid_from: new Date(Date.now() - HOUR),
      });
      const foreign: Src = { sourceId: "foreign-source", keyId: `foreign-${slug}`, kp };
      // Valid signature, valid key, but registered for a different organisation.
      await expectRejected(await ingest(await signed(foreign, 1)), 401, "unknown_key");
      // The other org's console cannot see ORG's sources and vice versa.
      const mine = await consoleReq(adminCookie, "GET", "/sources");
      const ids = ((await mine.json()) as { sources: Array<{ source_id: string }> }).sources.map(
        (s) => s.source_id,
      );
      expect(ids).not.toContain("foreign-source");
      const hist = await consoleReq(adminCookie, "GET", "/sources/foreign-source/history");
      expect(hist.status).toBe(404);
      const revoke = await consoleReq(
        adminCookie,
        "POST",
        `/sources/foreign-source/keys/foreign-${slug}/revoke`,
        { reason: "cross-org attempt" },
      );
      expect(revoke.status).toBe(404);
    } finally {
      client.release();
      for (const t of SOURCE_TABLES) {
        await pool.query(`DELETE FROM ${t} WHERE organization_id = $1`, [otherOrg]);
      }
      await pool.query(`DELETE FROM audit_log WHERE organization_id = $1`, [otherOrg]);
      await pool.query(`DELETE FROM organization WHERE organization_id = $1`, [otherOrg]);
    }
  });

  // --------------------------------------------------------- key lifecycle
  it("revoked key → 401 key_revoked", async () => {
    const src = await newSource();
    expect((await ingest(await signed(src, 1))).status).toBe(200);
    const client = await getPool().connect();
    try {
      await revokeSourceKey(client, {
        organization_id: ORG,
        source_id: src.sourceId,
        key_id: src.keyId,
        reason: "laptop lost",
        actor: "vitest",
      });
    } finally {
      client.release();
    }
    await expectRejected(await ingest(await signed(src, 2)), 401, "key_revoked");
    expect((await sourceRow(src)).last_seq).toBe(1);
  });

  it("expired key (valid_to before server receive time) → 401 key_expired", async () => {
    const src = await newSource({ validFrom: new Date(Date.now() - 3 * HOUR) });
    await getPool().query(
      `UPDATE source_key SET valid_to = now() - interval '1 hour'
       WHERE organization_id = $1 AND key_id = $2`,
      [ORG, src.keyId],
    );
    await expectRejected(await ingest(await signed(src, 1)), 401, "key_expired");
  });

  it("key not yet valid (valid_from after server receive time) → 401 key_not_yet_valid", async () => {
    const src = await newSource({ validFrom: new Date(Date.now() + HOUR) });
    await expectRejected(await ingest(await signed(src, 1)), 401, "key_not_yet_valid");
  });

  it("key revoked at T; event arrives after T claiming ts before T → 401 key_revoked", async () => {
    const src = await newSource({ validFrom: new Date(Date.now() - 3 * HOUR) });
    const client = await getPool().connect();
    try {
      await revokeSourceKey(client, {
        organization_id: ORG,
        source_id: src.sourceId,
        key_id: src.keyId,
        reason: "revoked at T",
        actor: "vitest",
      });
    } finally {
      client.release();
    }
    // Claim a ts while the key was still valid — receive time is now (after revoke).
    const claimedPast = new Date(Date.now() - 30 * 60 * 1000);
    await expectRejected(
      await ingest(await signed(src, 1, { ts: claimedPast })),
      401,
      "key_revoked",
    );
  });

  it("key expired at T; event arrives after T claiming ts before T → 401 key_expired", async () => {
    const src = await newSource({ validFrom: new Date(Date.now() - 5 * HOUR) });
    await getPool().query(
      `UPDATE source_key SET valid_to = now() - interval '1 hour'
       WHERE organization_id = $1 AND key_id = $2`,
      [ORG, src.keyId],
    );
    const claimedPast = new Date(Date.now() - 2 * HOUR); // still inside old validity window
    await expectRejected(
      await ingest(await signed(src, 1, { ts: claimedPast })),
      401,
      "key_expired",
    );
  });

  it("envelope ts inside the validity window of a bounded key is accepted", async () => {
    const src = await newSource({ validFrom: new Date(Date.now() - 3 * HOUR) });
    await getPool().query(
      `UPDATE source_key SET valid_to = now() + interval '1 hour'
       WHERE organization_id = $1 AND key_id = $2`,
      [ORG, src.keyId],
    );
    expect((await ingest(await signed(src, 1))).status).toBe(200);
  });

  it("disabled source → 403 source_disabled", async () => {
    const src = await newSource();
    const client = await getPool().connect();
    try {
      await disableSource(client, {
        organization_id: ORG,
        source_id: src.sourceId,
        reason: "decommissioned",
        actor: "vitest",
      });
    } finally {
      client.release();
    }
    await expectRejected(await ingest(await signed(src, 1)), 403, "source_disabled");
  });

  it("rotation: new key works, old key is refused (key_inactive)", async () => {
    const src = await newSource();
    expect((await ingest(await signed(src, 1))).status).toBe(200);
    const next = await generateKeyPair();
    const nextKeyId = `key-${randomUUID().slice(0, 8)}`;
    const client = await getPool().connect();
    try {
      const out = await addSourceKey(client, {
        organization_id: ORG,
        source_id: src.sourceId,
        key_id: nextKeyId,
        public_key_b64: next.publicKeyB64,
        actor: "vitest",
      });
      expect(out.retired).toEqual([src.keyId]);
    } finally {
      client.release();
    }
    await expectRejected(await ingest(await signed(src, 2)), 401, "key_inactive");
    const res = await ingest(
      await signed(src, 2, { signWith: next, keyId: nextKeyId }),
    );
    expect(res.status).toBe(200);
  });

  // ------------------------------------------------------------- time skew
  it("timestamp more than 5 minutes off → 400 timestamp_skew (past and future)", async () => {
    const src = await newSource();
    await expectRejected(
      await ingest(await signed(src, 1, { ts: new Date(Date.now() - 10 * MIN) })),
      400,
      "timestamp_skew",
    );
    await expectRejected(
      await ingest(await signed(src, 1, { ts: new Date(Date.now() + 10 * MIN) })),
      400,
      "timestamp_skew",
    );
    // Within the window is fine.
    expect(
      (await ingest(await signed(src, 1, { ts: new Date(Date.now() - 2 * MIN) }))).status,
    ).toBe(200);
  });

  it("AEGIS_SOURCE_TS_SKEW_SEC widens or narrows the window", async () => {
    const src = await newSource();
    process.env.AEGIS_SOURCE_TS_SKEW_SEC = "1800";
    try {
      expect(
        (await ingest(await signed(src, 1, { ts: new Date(Date.now() - 10 * MIN) }))).status,
      ).toBe(200);
      process.env.AEGIS_SOURCE_TS_SKEW_SEC = "30";
      await expectRejected(
        await ingest(await signed(src, 2, { ts: new Date(Date.now() - 2 * MIN) })),
        400,
        "timestamp_skew",
      );
    } finally {
      delete process.env.AEGIS_SOURCE_TS_SKEW_SEC;
    }
  });

  // ------------------------------------------------------ replay protection
  it("same seq again → 409 seq_replay; lower seq → 409 seq_replay", async () => {
    const src = await newSource();
    for (const seq of [1, 2, 3]) {
      expect((await ingest(await signed(src, seq))).status).toBe(200);
    }
    // Fresh nonce + idempotency key, so only the sequence rule can refuse these.
    await expectRejected(await ingest(await signed(src, 3)), 409, "seq_replay");
    await expectRejected(await ingest(await signed(src, 2)), 409, "seq_replay");
    await expectRejected(await ingest(await signed(src, 1)), 409, "seq_replay");
    expect((await sourceRow(src)).last_seq).toBe(3);
    expect(await gaps(src)).toEqual([]);
  });

  it("nonce reuse → 409 nonce_reused and state does not advance", async () => {
    const src = await newSource();
    const first = await signed(src, 1);
    expect((await ingest(first)).status).toBe(200);
    const reuse = await signed(src, 2, { nonce: first.nonce });
    await expectRejected(await ingest(reuse), 409, "nonce_reused");
    expect((await sourceRow(src)).last_seq).toBe(1);
    // A fresh nonce at the same seq works: the failed attempt consumed nothing.
    expect((await ingest(await signed(src, 2))).status).toBe(200);
  });

  it("a nonce is scoped to its source", async () => {
    const a = await newSource();
    const b = await newSource();
    const first = await signed(a, 1);
    expect((await ingest(first)).status).toBe(200);
    expect((await ingest(await signed(b, 1, { nonce: first.nonce }))).status).toBe(200);
  });

  // ------------------------------------------------------------ idempotency
  it("duplicate delivery returns the stored response and changes nothing", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const one = await ingest(env);
    expect(one.status).toBe(200);
    const first = (await one.json()) as Record<string, unknown>;
    const two = await ingest(env);
    expect(two.status).toBe(200);
    expect(await two.json()).toEqual(first);
    expect((await sourceRow(src)).last_seq).toBe(1);

    const receipts = await getPool().query(
      `SELECT 1 FROM forensic_receipt
       WHERE organization_id = $1 AND case_id = $2`,
      [ORG, env.event.case_id],
    );
    expect(receipts.rowCount).toBe(1);
    const stored = await getPool().query<{ receipt_id: string | null }>(
      `SELECT receipt_id FROM source_envelope_idempotency
       WHERE organization_id = $1 AND idempotency_key = $2`,
      [ORG, env.idempotency_key],
    );
    expect(stored.rows[0]?.receipt_id).toBe(first.receipt_id);
  });

  it("duplicate delivery still answers after the key is revoked", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    expect((await ingest(env)).status).toBe(200);
    const client = await getPool().connect();
    try {
      await revokeSourceKey(client, {
        organization_id: ORG,
        source_id: src.sourceId,
        key_id: src.keyId,
        reason: "rotated by policy",
      });
    } finally {
      client.release();
    }
    expect((await ingest(env)).status).toBe(200);
    // ... but a new event under that key is refused.
    await expectRejected(await ingest(await signed(src, 2)), 401, "key_revoked");
  });

  it("idempotency key reused for a different envelope → 409 idempotency_conflict", async () => {
    const src = await newSource();
    const idem = randomUUID();
    expect((await ingest(await signed(src, 1, { idempotency_key: idem }))).status).toBe(200);
    await expectRejected(
      await ingest(await signed(src, 2, { idempotency_key: idem })),
      409,
      "idempotency_conflict",
    );
    expect((await sourceRow(src)).last_seq).toBe(1);
  });

  it("Idempotency-Key header must match the envelope", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const res = await post("/v1/aegis/source-events", env, {
      "Idempotency-Key": randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("idempotency_mismatch");
    const ok = await post("/v1/aegis/source-events", env, {
      "Idempotency-Key": env.idempotency_key,
    });
    expect(ok.status).toBe(200);
  });

  it("envelope.idempotency_key must equal event.idempotency_key (governed + bank paths)", async () => {
    const src = await newSource();
    const { eventHash, signatureInput, base64urlEncode } = await import("@salanor/aegis-sdk");
    const ed = await import("@noble/ed25519");
    const env = await signed(src, 1);
    const otherIdem = "11111111-1111-4111-8111-111111111111";
    const badEvent = { ...env.event, idempotency_key: otherIdem };
    // Craft: envelope.idem stays original; event.idem differs; event_hash + signature match that craft.
    const crafted = {
      ...env,
      event: badEvent,
      event_hash: eventHash(badEvent),
    };
    const digest = signatureInput(crafted);
    const sig = await ed.signAsync(digest, src.kp.privateKey);
    const broken = { ...crafted, signature: base64urlEncode(new Uint8Array(sig)) };
    for (const path of [
      "/v1/aegis/source-events",
      "/v1/aegis/governed/events",
      "/v1/aegis/bank/events",
    ]) {
      const res = await post(path, broken);
      expect(res.status, path).toBe(400);
      const body = (await res.json()) as { code?: string; message?: string; error?: string };
      const text = `${body.code ?? ""} ${body.message ?? ""} ${body.error ?? ""}`;
      expect(text.includes("idempotency") || body.code === "malformed", path).toBe(true);
    }
  });

  // ------------------------------------------------------------ seq gaps
  it("sequence gap is accepted, recorded, shown in the console, and closed by late arrivals", async () => {
    const src = await newSource();
    expect((await ingest(await signed(src, 1))).status).toBe(200);
    expect((await ingest(await signed(src, 5))).status).toBe(200);
    expect((await sourceRow(src)).last_seq).toBe(5);
    expect(await gaps(src)).toEqual([[2, 4]]);

    const list = await consoleReq(adminCookie, "GET", "/sources");
    const entry = ((await list.json()) as {
      sources: Array<{ source_id: string; open_gap_count: number; last_seq: number }>;
    }).sources.find((s) => s.source_id === src.sourceId);
    expect(entry?.open_gap_count).toBe(1);
    expect(entry?.last_seq).toBe(5);

    // Late 3 fills the middle of the gap; last_seq does not move backwards.
    expect((await ingest(await signed(src, 3))).status).toBe(200);
    expect(await gaps(src)).toEqual([
      [2, 2],
      [4, 4],
    ]);
    expect((await sourceRow(src)).last_seq).toBe(5);
    expect((await ingest(await signed(src, 2))).status).toBe(200);
    expect((await ingest(await signed(src, 4))).status).toBe(200);
    expect(await gaps(src)).toEqual([]);
    // Everything is now accounted for; any further reuse is a replay.
    await expectRejected(await ingest(await signed(src, 3)), 409, "seq_replay");
  });

  it("adjacent sequence numbers record no gap", async () => {
    const src = await newSource();
    for (const seq of [1, 2, 3]) {
      expect((await ingest(await signed(src, seq))).status).toBe(200);
    }
    expect(await gaps(src)).toEqual([]);
  });

  // ------------------------------------------------- verifyAndAcceptEnvelope
  it("process() failure rolls back nonce, sequence and idempotency", async () => {
    const src = await newSource();
    const env = await signed(src, 1);
    const client = await getPool().connect();
    try {
      await expect(
        verifyAndAcceptEnvelope(client, ORG, env, {
          process: async () => {
            throw new Error("boom");
          },
        }),
      ).rejects.toThrow("boom");
      // The advisory lock was released: a second call on the same source proceeds.
      const ok = await verifyAndAcceptEnvelope(client, ORG, env, {
        process: async () => ({ receipt_id: "rcpt_unit" }),
      });
      expect(ok.ok).toBe(true);
    } finally {
      client.release();
    }
    expect((await sourceRow(src)).last_seq).toBe(1);
  });

  it("verifyAndAcceptEnvelope honours an injected clock", async () => {
    const src = await newSource();
    const future = new Date(Date.now() + 2 * HOUR);
    const env = await signed(src, 1, { ts: future });
    const client = await getPool().connect();
    try {
      const res = await verifyAndAcceptEnvelope(client, ORG, env, {
        now: () => future,
        process: async () => ({ receipt_id: "rcpt_clock" }),
      });
      expect(res.ok).toBe(true);
    } finally {
      client.release();
    }
  });

  // ----------------------------------------------- require_signed_events
  it("unsigned events: accepted by default, rejected when the org requires signed events", async () => {
    const pool = getPool();
    const unsigned = () => ({
      schema_version: 1,
      case_id: `case-${randomUUID()}`,
      idempotency_key: randomUUID(),
      event_type: "generic",
      emitted_at: new Date().toISOString(),
      attributes: { amount: "10.00", currency: "EUR" },
    });

    const open = await post("/v1/aegis/governed/events", unsigned());
    expect(open.status).toBe(200);
    expect(((await open.json()) as { source_signed?: boolean }).source_signed).toBeUndefined();

    await pool.query(
      `UPDATE organization SET require_signed_events = true WHERE organization_id = $1`,
      [ORG],
    );
    try {
      for (const path of ["/v1/aegis/governed/events", "/v1/aegis/bank/events"]) {
        const res = await post(path, unsigned());
        expect(res.status).toBe(400);
        const body = (await res.json()) as { code: string; message: string };
        expect(body.code).toBe("signed_events_required");
        expect(body.message).toMatch(/Connector/);
        expect(body.message).toMatch(/aegis-sdk/);
      }
      // Batch commit is an unsigned path too; a dry run only reports.
      const batch = (dry: boolean) =>
        post("/v1/aegis/governed/events/batch", {
          format: "jsonl",
          text: JSON.stringify(unsigned()),
          dry_run: dry,
        });
      expect((await batch(false)).status).toBe(400);
      expect((await batch(true)).status).toBe(200);

      // Signed events still go through.
      const src = await newSource();
      expect((await ingest(await signed(src, 1))).status).toBe(200);
    } finally {
      await pool.query(
        `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
        [ORG],
      );
    }
    expect((await post("/v1/aegis/governed/events", unsigned())).status).toBe(200);
  });

  it("require_signed_events defaults to false for ordinary organisations", async () => {
    const col = await getPool().query<{ column_default: string; is_nullable: string }>(
      `SELECT column_default, is_nullable FROM information_schema.columns
       WHERE table_name = 'organization' AND column_name = 'require_signed_events'`,
    );
    expect(col.rows[0]?.column_default).toBe("false");
    expect(col.rows[0]?.is_nullable).toBe("NO");
  });

  it("demo organisations flagged through platform-auth require signed events", async () => {
    const { platformUpdateOrganization } = await import("@salanor/platform-auth");
    const pool = getPool();
    const slug = `src-demo-${randomUUID().slice(0, 8)}`;
    const created = await pool.query<{ organization_id: string }>(
      `INSERT INTO organization (name, slug) VALUES ($1, $2) RETURNING organization_id`,
      [`Demo ${slug}`, slug],
    );
    const id = created.rows[0]!.organization_id;
    try {
      const before = await pool.query<{ require_signed_events: boolean }>(
        `SELECT require_signed_events FROM organization WHERE organization_id = $1`,
        [id],
      );
      expect(before.rows[0]?.require_signed_events).toBe(false);
      expect(await platformUpdateOrganization(pool, id, { is_demo: true })).toBe(true);
      const after = await pool.query<{ require_signed_events: boolean; is_demo: boolean }>(
        `SELECT require_signed_events, is_demo FROM organization WHERE organization_id = $1`,
        [id],
      );
      expect(after.rows[0]).toEqual({ require_signed_events: true, is_demo: true });
    } finally {
      await pool.query(`DELETE FROM organization WHERE organization_id = $1`, [id]);
    }
  });

  // ---------------------------------------------------------- console API
  describe("console Sources API (admin only)", () => {
    it("401 without a session; 403 for a viewer on every route", async () => {
      const routes: Array<[string, string, unknown?]> = [
        ["GET", "/sources"],
        ["POST", "/sources", {}],
        ["POST", "/sources/s1/keys", {}],
        ["POST", "/sources/s1/keys/k1/revoke", { reason: "x" }],
        ["GET", "/sources/s1/history"],
      ];
      for (const [method, path, body] of routes) {
        const anon = await app.request(`/v1/console${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        expect(anon.status, `${method} ${path} anon`).toBe(401);
        const viewer = await consoleReq(viewerCookie, method, path, body);
        expect(viewer.status, `${method} ${path} viewer`).toBe(403);
      }
    });

    it("register → list → rotate → revoke → history", async () => {
      const kp = await generateKeyPair();
      const sourceId = `con-${randomUUID().slice(0, 8)}`;
      const keyId = `ck-${randomUUID().slice(0, 8)}`;

      const created = await consoleReq(adminCookie, "POST", "/sources", {
        source_id: sourceId,
        name: "Core Banking Adapter",
        kind: "executor",
        owner_contact: "payments-ops@example.test",
        public_key_b64: kp.publicKeyB64,
        key_id: keyId,
      });
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as {
        source: {
          source_id: string;
          kind: string;
          status: string;
          last_seq: number;
          active_key: { key_id: string; fingerprint: string } | null;
        };
      };
      expect(createdBody.source).toMatchObject({
        source_id: sourceId,
        kind: "executor",
        status: "active",
        last_seq: 0,
      });
      expect(createdBody.source.active_key?.key_id).toBe(keyId);
      expect(createdBody.source.active_key?.fingerprint).toBe(
        `${kp.publicKeyB64.slice(0, 8)}…${kp.publicKeyB64.slice(-8)}`,
      );

      const src: Src = { sourceId, keyId, kp };
      // The console-registered key works immediately (valid_from defaults to now; sign slightly later).
      await new Promise((r) => setTimeout(r, 25));
      expect((await ingest(await signed(src, 1))).status).toBe(200);

      const listed = await consoleReq(adminCookie, "GET", "/sources");
      const listedBody = (await listed.json()) as {
        sources: Array<{
          source_id: string;
          last_seq: number;
          last_event_at: string | null;
          open_gap_count: number;
          keys: Array<{ key_id: string; status: string }>;
        }>;
      };
      const row = listedBody.sources.find((s) => s.source_id === sourceId);
      expect(row?.last_seq).toBe(1);
      expect(row?.last_event_at).toBeTruthy();
      expect(row?.open_gap_count).toBe(0);
      expect(row?.keys).toHaveLength(1);

      // Rotate.
      const next = await generateKeyPair();
      const nextKeyId = `ck-${randomUUID().slice(0, 8)}`;
      const rotated = await consoleReq(adminCookie, "POST", `/sources/${sourceId}/keys`, {
        key_id: nextKeyId,
        public_key_b64: next.publicKeyB64,
      });
      expect(rotated.status).toBe(201);
      expect(((await rotated.json()) as { retired_key_ids: string[] }).retired_key_ids).toEqual([
        keyId,
      ]);
      await expectRejected(await ingest(await signed(src, 2)), 401, "key_inactive");
      expect(
        (await ingest(await signed(src, 2, { signWith: next, keyId: nextKeyId }))).status,
      ).toBe(200);

      // Revoke requires a reason.
      const noReason = await consoleReq(
        adminCookie,
        "POST",
        `/sources/${sourceId}/keys/${nextKeyId}/revoke`,
        {},
      );
      expect(noReason.status).toBe(422);
      const revoked = await consoleReq(
        adminCookie,
        "POST",
        `/sources/${sourceId}/keys/${nextKeyId}/revoke`,
        { reason: "key exposed in logs" },
      );
      expect(revoked.status).toBe(200);
      const revokedBody = (await revoked.json()) as {
        key: { status: string; reason: string; revoked_by: string | null };
      };
      expect(revokedBody.key.status).toBe("revoked");
      expect(revokedBody.key.reason).toBe("key exposed in logs");
      expect(revokedBody.key.revoked_by).toBeTruthy();
      await expectRejected(
        await ingest(await signed(src, 3, { signWith: next, keyId: nextKeyId })),
        401,
        "key_revoked",
      );
      const again = await consoleReq(
        adminCookie,
        "POST",
        `/sources/${sourceId}/keys/${nextKeyId}/revoke`,
        { reason: "again" },
      );
      expect(again.status).toBe(409);
      const missing = await consoleReq(
        adminCookie,
        "POST",
        `/sources/${sourceId}/keys/does-not-exist/revoke`,
        { reason: "x" },
      );
      expect(missing.status).toBe(404);

      // History.
      const hist = await consoleReq(adminCookie, "GET", `/sources/${sourceId}/history`);
      expect(hist.status).toBe(200);
      const histBody = (await hist.json()) as {
        source: { source_id: string };
        events: Array<{ action: string; key_id: string | null; actor: string | null }>;
        gaps: unknown[];
      };
      expect(histBody.source.source_id).toBe(sourceId);
      const actions = histBody.events.map((e) => e.action);
      expect(actions).toEqual(
        expect.arrayContaining(["registered", "key_added", "key_rotated", "key_revoked"]),
      );
      expect(histBody.events.every((e) => e.actor)).toBe(true);
      expect(histBody.events.find((e) => e.action === "key_revoked")?.key_id).toBe(nextKeyId);

      // Console actions are in the audit log.
      const audit = await getPool().query<{ action: string }>(
        `SELECT action FROM audit_log
         WHERE organization_id = $1 AND resource_id = $2 AND action LIKE 'source.%'`,
        [ORG, sourceId],
      );
      expect(audit.rows.map((a) => a.action)).toEqual(
        expect.arrayContaining(["source.registered", "source.key_added", "source.key_revoked"]),
      );
    });

    it("validation and conflicts", async () => {
      const kp = await generateKeyPair();
      const good = {
        source_id: `val-${randomUUID().slice(0, 8)}`,
        name: "Validation source",
        kind: "collector",
        public_key_b64: kp.publicKeyB64,
        key_id: `vk-${randomUUID().slice(0, 8)}`,
      };
      const post = (body: unknown) => consoleReq(adminCookie, "POST", "/sources", body);

      expect((await post({ ...good, name: "" })).status).toBe(422);
      expect((await post({ ...good, kind: "mainframe" })).status).toBe(422);
      expect((await post({ ...good, source_id: "has spaces" })).status).toBe(422);
      expect((await post({ ...good, key_id: "bad key!" })).status).toBe(422);
      expect((await post({ ...good, public_key_b64: "AAAA" })).status).toBe(422);
      expect((await post({ ...good, public_key_b64: "not base64 !!" })).status).toBe(422);
      expect((await post({ ...good, valid_from: "yesterday-ish" })).status).toBe(422);
      expect((await post({ ...good, source_id: undefined })).status).toBe(422);

      expect((await post(good)).status).toBe(201);
      expect((await post(good)).status).toBe(409);
      // Key ids are unique per organisation, even across sources.
      expect(
        (await post({ ...good, source_id: `val-${randomUUID().slice(0, 8)}` })).status,
      ).toBe(409);

      const dupKey = await consoleReq(adminCookie, "POST", `/sources/${good.source_id}/keys`, {
        key_id: good.key_id,
        public_key_b64: (await generateKeyPair()).publicKeyB64,
      });
      expect(dupKey.status).toBe(409);
      const unknownSource = await consoleReq(adminCookie, "POST", "/sources/nope/keys", {
        key_id: `vk-${randomUUID().slice(0, 8)}`,
        public_key_b64: kp.publicKeyB64,
      });
      expect(unknownSource.status).toBe(404);
      expect((await consoleReq(adminCookie, "GET", "/sources/nope/history")).status).toBe(404);
    });

    it("a scheduled key (valid_from in the future) does not retire the current key", async () => {
      const src = await newSource();
      const next = await generateKeyPair();
      const nextKeyId = `sk-${randomUUID().slice(0, 8)}`;
      const res = await consoleReq(adminCookie, "POST", `/sources/${src.sourceId}/keys`, {
        key_id: nextKeyId,
        public_key_b64: next.publicKeyB64,
        valid_from: new Date(Date.now() + 24 * HOUR).toISOString(),
      });
      expect(res.status).toBe(201);
      expect(((await res.json()) as { retired_key_ids: string[] }).retired_key_ids).toEqual([]);
      expect((await ingest(await signed(src, 1))).status).toBe(200);
      await expectRejected(
        await ingest(await signed(src, 2, { signWith: next, keyId: nextKeyId })),
        401,
        "key_not_yet_valid",
      );
    });

  });

  // ------------------------------------------------------------- parallel
  it("50 parallel ingests from one source: all accepted, no duplicates, contiguous accounting", async () => {
    const src = await newSource();
    const N = 50;
    const envs = await Promise.all(
      Array.from({ length: N }, (_, i) => signed(src, i + 1)),
    );
    // Shuffle so arrival order is not seq order.
    envs.sort(() => Math.random() - 0.5);

    const responses = await Promise.all(envs.map((e) => ingest(e)));
    const bodies = await Promise.all(
      responses.map((r) => r.json() as Promise<Record<string, unknown>>),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s !== 200), JSON.stringify(bodies.filter((_, i) => statuses[i] !== 200).slice(0, 3))).toEqual([]);

    // Every envelope produced its own decision and receipt.
    const receiptIds = bodies.map((b) => b.receipt_id as string);
    expect(new Set(receiptIds).size).toBe(N);
    expect(bodies.every((b) => b.source_signed === true && b.evidence_grade === "G1")).toBe(true);

    // Source state: contiguous 1..N, no open gaps, one idempotency row each.
    expect((await sourceRow(src)).last_seq).toBe(N);
    expect(await gaps(src)).toEqual([]);
    const idem = await getPool().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM source_envelope_idempotency
       WHERE organization_id = $1 AND source_id = $2`,
      [ORG, src.sourceId],
    );
    expect(Number(idem.rows[0]!.n)).toBe(N);
    const nonces = await getPool().query<{ n: string }>(
      `SELECT count(*)::text AS n FROM source_nonce
       WHERE organization_id = $1 AND source_id = $2`,
      [ORG, src.sourceId],
    );
    expect(Number(nonces.rows[0]!.n)).toBe(N);

    // Receipt chain for these decisions has distinct, increasing sequence numbers.
    const seqs = await getPool().query<{ seq: string }>(
      `SELECT seq::text FROM forensic_receipt
       WHERE organization_id = $1 AND receipt_id = ANY($2::text[]) ORDER BY seq`,
      [ORG, receiptIds],
    );
    const nums = seqs.rows.map((r) => Number(r.seq));
    expect(nums).toHaveLength(N);
    expect(new Set(nums).size).toBe(N);
    expect(nums[N - 1]! - nums[0]!).toBe(N - 1);

    // A replay of any of them (new nonce) is now refused.
    await expectRejected(await ingest(await signed(src, 25)), 409, "seq_replay");
  }, 120_000);
});
