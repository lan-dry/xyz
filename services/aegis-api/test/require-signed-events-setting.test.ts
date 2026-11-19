/**
 * Stage 1 correction: require_signed_events enable/disable with two-person rule + seal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  generateKeyPair,
  buildEnvelope,
  signEnvelope,
} from "@salanor/aegis-sdk";
import "../src/db/load-env.js";
import { createApp } from "../src/app.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { isReceiptSigningConfigured } from "../src/crypto/receipt-signing.js";
import { registerSource } from "../src/sources/registry.js";
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
const ADMIN_PASSWORD = "require-signed-setting-pw-123";

describeIfDb("require_signed_events setting (two-person + seal)", () => {
  const app = createApp();
  const saved: Record<string, string | undefined> = {};
  let adminCookie = "";
  let admin2Cookie = "";
  let adminMembershipId = "";
  let admin2MembershipId = "";
  const createdAccounts: string[] = [];

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

  function consoleReq(
    cookie: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    return app.request(`/v1/console${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    for (const k of ["AEGIS_RECEIPT_SIGNING_KEY_B64", "AEGIS_RECEIPT_KEY_ID", "INGEST_RATE_LIMIT_PER_MIN"]) {
      saved[k] = process.env[k];
    }
    process.env.INGEST_RATE_LIMIT_PER_MIN = "100000";
    if (!isReceiptSigningConfigured()) {
      process.env.AEGIS_RECEIPT_SIGNING_KEY_B64 = (await generateKeyPair()).privateKeyB64;
      process.env.AEGIS_RECEIPT_KEY_ID = "receipt_setting_test";
    }

    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    await ensureDevIngestKey(pool, INGEST, ORG);
    await ensureDevSigningKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await ensureDevBridgeKey(pool, privateKeyB64, KEY, AGENT, ORG);
    await pool.query(
      `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
      [ORG],
    );
    await pool.query(
      `DELETE FROM organization_setting_change WHERE organization_id = $1`,
      [ORG],
    );

    const admin = await insertTestAdmin(pool, {
      organizationId: ORG,
      password: ADMIN_PASSWORD,
    });
    createdAccounts.push(admin.accountId);
    adminMembershipId = admin.membershipId;
    adminCookie = await login(admin.email);

    const admin2 = await insertTestAdmin(pool, {
      organizationId: ORG,
      password: ADMIN_PASSWORD,
    });
    createdAccounts.push(admin2.accountId);
    admin2MembershipId = admin2.membershipId;
    admin2Cookie = await login(admin2.email);
  });

  afterAll(async () => {
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
        [ORG],
      );
      await pool.query(
        `DELETE FROM organization_setting_change WHERE organization_id = $1`,
        [ORG],
      );
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

  it("enabling works with one admin and seals a setting_change receipt", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
      [ORG],
    );
    await pool.query(
      `DELETE FROM organization_setting_change WHERE organization_id = $1`,
      [ORG],
    );

    const res = await consoleReq(adminCookie, "POST", "/organization/require-signed-events", {
      enabled: true,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      require_signed_events: boolean;
      change_id: string;
      receipt_id: string | null;
      sealed: boolean;
    };
    expect(body.require_signed_events).toBe(true);
    expect(body.sealed).toBe(true);
    expect(body.receipt_id).toBeTruthy();

    const flag = await pool.query<{ require_signed_events: boolean }>(
      `SELECT require_signed_events FROM organization WHERE organization_id = $1`,
      [ORG],
    );
    expect(flag.rows[0]?.require_signed_events).toBe(true);

    const receipt = await pool.query<{
      outcome: string;
      case_id: string;
      body: { attributes: Record<string, unknown> };
    }>(
      `SELECT outcome, case_id, body FROM forensic_receipt
       WHERE organization_id = $1 AND receipt_id = $2`,
      [ORG, body.receipt_id],
    );
    expect(receipt.rows[0]?.outcome).toBe("setting_change");
    expect(receipt.rows[0]?.case_id).toBe("ORG-SETTING-require_signed_events");
    const sc = receipt.rows[0]?.body.attributes.setting_change as {
      from_value: boolean;
      to_value: boolean;
      requested_by: string;
    };
    expect(sc).toMatchObject({
      from_value: false,
      to_value: true,
      requested_by: adminMembershipId,
    });
    expect(receipt.rows[0]?.body.attributes.require_signed_events_in_force).toBe(true);

    const profile = await consoleReq(adminCookie, "GET", "/organization/profile");
    expect(
      ((await profile.json()) as { organization: { require_signed_events: boolean } })
        .organization.require_signed_events,
    ).toBe(true);
  });

  it("disabling creates pending; same admin cannot confirm; second admin confirms and seals", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE organization SET require_signed_events = true WHERE organization_id = $1`,
      [ORG],
    );
    await pool.query(
      `DELETE FROM organization_setting_change WHERE organization_id = $1`,
      [ORG],
    );

    const pending = await consoleReq(adminCookie, "POST", "/organization/require-signed-events", {
      enabled: false,
    });
    expect(pending.status).toBe(200);
    const pendingBody = (await pending.json()) as {
      pending_confirmation: boolean;
      change_id: string;
      require_signed_events: boolean;
    };
    expect(pendingBody.pending_confirmation).toBe(true);
    expect(pendingBody.require_signed_events).toBe(true);

    const stillOn = await pool.query<{ require_signed_events: boolean }>(
      `SELECT require_signed_events FROM organization WHERE organization_id = $1`,
      [ORG],
    );
    expect(stillOn.rows[0]?.require_signed_events).toBe(true);

    const sameAdmin = await consoleReq(adminCookie, "POST", "/organization/require-signed-events", {
      enabled: false,
    });
    expect(sameAdmin.status).toBe(403);

    const confirm = await consoleReq(admin2Cookie, "POST", "/organization/require-signed-events", {
      enabled: false,
    });
    expect(confirm.status).toBe(200);
    const confirmBody = (await confirm.json()) as {
      require_signed_events: boolean;
      receipt_id: string | null;
      sealed: boolean;
      change_id: string;
    };
    expect(confirmBody.require_signed_events).toBe(false);
    expect(confirmBody.sealed).toBe(true);
    expect(confirmBody.change_id).toBe(pendingBody.change_id);

    const receipt = await pool.query<{
      outcome: string;
      body: { attributes: { setting_change: Record<string, unknown> } };
    }>(
      `SELECT outcome, body FROM forensic_receipt
       WHERE organization_id = $1 AND receipt_id = $2`,
      [ORG, confirmBody.receipt_id],
    );
    expect(receipt.rows[0]?.outcome).toBe("setting_change");
    expect(receipt.rows[0]?.body.attributes.setting_change).toMatchObject({
      from_value: true,
      to_value: false,
      requested_by: adminMembershipId,
      confirmed_by: admin2MembershipId,
    });
  });

  it("sealed event carries require_signed_events_in_force from the org column", async () => {
    const pool = getPool();
    await pool.query(
      `UPDATE organization SET require_signed_events = true WHERE organization_id = $1`,
      [ORG],
    );

    const kp = await generateKeyPair();
    const sourceId = `src-rs-${randomUUID().slice(0, 8)}`;
    const keyId = `key-rs-${randomUUID().slice(0, 8)}`;
    const client = await pool.connect();
    try {
      await registerSource(client, {
        organization_id: ORG,
        source_id: sourceId,
        name: `RS ${sourceId}`,
        kind: "application",
        key_id: keyId,
        public_key_b64: kp.publicKeyB64,
        valid_from: new Date(Date.now() - 60_000),
        actor: "vitest",
      });
    } finally {
      client.release();
    }

    const idem = randomUUID();
    const unsigned = buildEnvelope({
      source_id: sourceId,
      key_id: keyId,
      seq: 1,
      idempotency_key: idem,
      event: {
        schema_version: 1,
        case_id: `case-${randomUUID()}`,
        idempotency_key: idem,
        event_type: "generic",
        emitted_at: new Date().toISOString(),
        attributes: { amount: "10.00", currency: "EUR" },
      },
    });
    const env = await signEnvelope(unsigned, kp.privateKey);
    const res = await app.request("/v1/aegis/source-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${INGEST}`,
      },
      body: JSON.stringify(env),
    });
    if (res.status !== 200) {
      throw new Error(`ingest failed ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { receipt_id: string; event_id: string };

    const receipt = await pool.query<{ body: { attributes: Record<string, unknown> } }>(
      `SELECT body FROM forensic_receipt WHERE organization_id = $1 AND receipt_id = $2`,
      [ORG, body.receipt_id],
    );
    expect(receipt.rows[0]?.body.attributes.require_signed_events_in_force).toBe(true);

    const ev = await pool.query<{ payload: { attributes: Record<string, unknown> } }>(
      `SELECT payload FROM event WHERE organization_id = $1 AND event_id = $2`,
      [ORG, body.event_id],
    );
    expect(ev.rows[0]?.payload.attributes.require_signed_events_in_force).toBe(true);

    await pool.query(
      `UPDATE organization SET require_signed_events = false WHERE organization_id = $1`,
      [ORG],
    );
  });
});
