/**
 * Gate 0: tenant A must never read or write tenant B resources.
 * Covers console session org binding, inventory deny-by-default, and
 * authenticated cross-org reads/writes on critical paths.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ConsoleSession } from "@salanor/platform-auth";
import {
  canReadOrgConsole,
  canWriteOrgConsole,
  createSession,
  SALANOR_SESSION_COOKIE,
} from "@salanor/platform-auth";
import { ALL_ROUTE_RULES } from "../src/auth/route-inventory.js";
import { assertCanSetTenantKind, isWipeableOrg } from "../src/tenants/tenant-kind.js";
import { rejectNonSyntheticPayload } from "../src/tenants/synthetic-guard.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  ORG_A_ID,
  ORG_B_ID,
  cleanupIsolationFixtures,
  insertAgent,
  insertEvent,
  insertOrganization,
  insertSigningKey,
  insertTrace,
} from "./helpers.js";
import { insertTestAdmin } from "./insert-test-admin.js";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function session(orgId: string, role = "admin"): ConsoleSession {
  return {
    sessionId: "sess-iso",
    userId: "mem-iso",
    accountId: "acc-iso",
    organizationId: orgId,
    email: "iso@example.com",
    displayName: "Iso",
    role,
  };
}

describe("tenant isolation — session org binding", () => {
  it("refuses cross-org console read/write helpers", () => {
    const a = session(ORG_A);
    expect(canReadOrgConsole(a, ORG_A)).toBe(true);
    expect(canWriteOrgConsole(a, ORG_A)).toBe(true);
    expect(canReadOrgConsole(a, ORG_B)).toBe(false);
    expect(canWriteOrgConsole(a, ORG_B)).toBe(false);
  });

  it("auditor cannot write or approve", () => {
    const auditor = session(ORG_A, "auditor");
    expect(canWriteOrgConsole(auditor, ORG_A)).toBe(false);
  });
});

function materializeRoute(path: string): string {
  return path
    .replaceAll(":policyId", "pol_x")
    .replaceAll(":eventId", "evt_x")
    .replaceAll(":traceId", "tr_x")
    .replaceAll(":reportId", "sealed_receipts")
    .replaceAll(":sourceId", "src_x")
    .replaceAll(":keyId", "key_x")
    .replaceAll(":exceptionId", "rex_x")
    .replaceAll(":feedId", "feed_x")
    .replaceAll(":runId", "rr_x")
    .replaceAll(":approvalId", "apr_x")
    .replaceAll(":exportId", "exp_x")
    .replaceAll(":workflowId", "wf_x")
    .replaceAll(":id", "apr_x");
}

describe("tenant isolation — unauthenticated routes stay closed", () => {
  const app = createApp();

  for (const route of ALL_ROUTE_RULES) {
    const path = materializeRoute(route.path);
    it(`${route.method} ${route.path} rejects anonymous callers`, async () => {
      const res = await app.request(path, {
        method: route.method,
        headers: {
          "Content-Type": "application/json",
          // Guessed foreign org — must not unlock anything without a real session.
          "X-Organization-Id": ORG_B,
        },
        body: ["POST", "PUT", "PATCH"].includes(route.method) ? "{}" : undefined,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("tenant kind immutability", () => {
  it("blocks sandbox → real", () => {
    const r = assertCanSetTenantKind("sandbox", "real");
    expect(r.ok).toBe(false);
  });

  it("allows wipe only for demo/test/sandbox", () => {
    expect(isWipeableOrg({ tenant_kind: "sandbox" })).toBe(true);
    expect(isWipeableOrg({ is_demo: true })).toBe(true);
    expect(isWipeableOrg({ tenant_kind: "real" })).toBe(false);
  });
});

describe("sandbox synthetic guard", () => {
  it("rejects card-like numbers", () => {
    const hit = rejectNonSyntheticPayload({
      attributes: { pan: "4111111111111111" },
    });
    expect(hit?.code).toBe("synthetic_data_required");
  });

  it("allows demo-shaped loan attributes", () => {
    const hit = rejectNonSyntheticPayload({
      attributes: {
        amount: 1_200_000,
        currency: "RWF",
        applicant_name: "Uwase Aline",
        beneficiary_account: "ACCT-DEMO-001",
      },
    });
    expect(hit).toBeNull();
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const TRACE_B = "trace-test-http-b";
const EVENT_B = "evt-test-http-b";
const APPROVAL_B = "apr-httpiso-b";
const SOURCE_B = "src-httpiso-b";
const FEED_B = "feed-httpiso-b";
const EXPORT_B = "exp-httpiso-b";
const CASE_B = "case-httpiso-b";

describeIfDb("tenant isolation — authenticated org A cannot touch org B", () => {
  const app = createApp();
  let cookie = "";
  let accountIds: string[] = [];
  const savedBridge = process.env.AEGIS_BRIDGE_MASTER_KEY;

  beforeAll(async () => {
    if (!process.env.AEGIS_BRIDGE_MASTER_KEY?.trim()) {
      process.env.AEGIS_BRIDGE_MASTER_KEY = Buffer.from(
        "test-bridge-master-key-32-bytes!!",
        "utf8",
      ).toString("base64");
    }
    await migrateUp();
    const client = await getPool().connect();
    try {
      await client.query(`DELETE FROM approval WHERE approval_id = $1`, [APPROVAL_B]);
      await client.query(`DELETE FROM source_key WHERE source_id = $1`, [SOURCE_B]);
      await client.query(`DELETE FROM source WHERE source_id = $1`, [SOURCE_B]);
      await client.query(`DELETE FROM reconciliation_feed WHERE feed_id = $1`, [FEED_B]);
      await client.query(`DELETE FROM compliance_export WHERE export_id = $1`, [EXPORT_B]);
      await client.query(`SET session_replication_role = replica`);
      try {
        await client.query(`DELETE FROM bank_case WHERE case_id = $1`, [CASE_B]);
      } finally {
        await client.query(`SET session_replication_role = DEFAULT`);
      }
      await cleanupIsolationFixtures(client);
      await insertOrganization(client, ORG_A_ID, "iso-http-a");
      await insertOrganization(client, ORG_B_ID, "iso-http-b");
      await client.query(
        `UPDATE organization SET region = $2, legal_hold = false WHERE organization_id = $1`,
        [ORG_A_ID, "eu-west"],
      );
      await client.query(
        `UPDATE organization SET region = $2, name = $3, legal_hold = false WHERE organization_id = $1`,
        [ORG_B_ID, "ap-southeast", "Org B secret"],
      );
      await insertAgent(client, "agent-test-http-b", ORG_B_ID, "iso-b");
      await insertSigningKey(client, "key-test-http-b", "agent-test-http-b", ORG_B_ID);
      await insertTrace(client, TRACE_B, ORG_B_ID, "agent-test-http-b");
      await insertEvent(client, {
        eventId: EVENT_B,
        organizationId: ORG_B_ID,
        traceId: TRACE_B,
        agentId: "agent-test-http-b",
        keyId: "key-test-http-b",
        sequenceNum: 1,
      });
      await client.query(
        `INSERT INTO bank_case (
           case_id, organization_id, idempotency_key, outcome, mode, status, trace_id
         ) VALUES ($1, $2, 'idem-httpiso-b', 'hold', 'enforce', 'held', $3)
         ON CONFLICT (organization_id, case_id) DO NOTHING`,
        [CASE_B, ORG_B_ID, TRACE_B],
      );
      await client.query(
        `INSERT INTO approval (approval_id, event_id, organization_id, channel_type, status, expires_at)
         VALUES ($1, $2, $3, 'web_ui', 'pending', now() + interval '2 days')`,
        [APPROVAL_B, EVENT_B, ORG_B_ID],
      );
      await client.query(
        `INSERT INTO source (organization_id, source_id, name, kind, owner_contact)
         VALUES ($1, $2, 'Org B ledger', 'application', 'b@example.test')`,
        [ORG_B_ID, SOURCE_B],
      );
      await client.query(
        `INSERT INTO reconciliation_feed (feed_id, organization_id, name, match_key)
         VALUES ($1, $2, 'Org B feed', 'case_id')`,
        [FEED_B, ORG_B_ID],
      );
      await client.query(
        `INSERT INTO compliance_export (
           export_id, organization_id, bundle_type, status, period_start, period_end
         ) VALUES ($1, $2, 'soc2', 'pending', now() - interval '30 days', now())`,
        [EXPORT_B, ORG_B_ID],
      );
      const admin = await insertTestAdmin(client, {
        organizationId: ORG_A_ID,
        password: "iso-http-password",
      });
      accountIds = [admin.accountId];
      const session = await createSession(client, admin.accountId, ORG_A_ID);
      cookie = `${SALANOR_SESSION_COOKIE}=${session.token}`;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (savedBridge === undefined) delete process.env.AEGIS_BRIDGE_MASTER_KEY;
    else process.env.AEGIS_BRIDGE_MASTER_KEY = savedBridge;
    const client = await getPool().connect();
    try {
      await client.query(`DELETE FROM approval WHERE approval_id = $1`, [APPROVAL_B]);
      await client.query(`DELETE FROM source WHERE source_id = $1`, [SOURCE_B]);
      await client.query(`DELETE FROM reconciliation_feed WHERE feed_id = $1`, [FEED_B]);
      await client.query(`DELETE FROM compliance_export WHERE export_id = $1`, [EXPORT_B]);
      await client.query(`SET session_replication_role = replica`);
      try {
        await client.query(`DELETE FROM bank_case WHERE case_id = $1`, [CASE_B]);
      } finally {
        await client.query(`SET session_replication_role = DEFAULT`);
      }
      await cleanupIsolationFixtures(client);
      if (accountIds.length > 0) {
        await client.query(`DELETE FROM account WHERE account_id = ANY($1::uuid[])`, [
          accountIds,
        ]);
      }
    } finally {
      client.release();
    }
    await closePool();
  });

  function asA(path: string, method = "GET", body?: string) {
    return app.request(path, {
      method,
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "X-Organization-Id": ORG_B_ID,
      },
      body,
    });
  }

  it("session stays on org A even when a foreign org id is sent", async () => {
    const res = await asA("/v1/console/auth/me");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { organization_id: string } };
    expect(body.user.organization_id).toBe(ORG_A_ID);
    expect(body.user.organization_id).not.toBe(ORG_B_ID);
  });

  it("cannot read org B cases, events, approvals, sources, or exports", async () => {
    const event = await asA(`/v1/console/events/${EVENT_B}`);
    expect(event.status).toBe(404);

    const trace = await asA(`/v1/console/traces/${TRACE_B}`);
    expect(trace.status).toBe(404);

    const summary = await asA(
      `/v1/console/cases/summary?trace_ids=${encodeURIComponent(TRACE_B)}`,
    );
    expect(summary.status).toBe(200);
    const summaryBody = (await summary.json()) as {
      cases: Record<string, { case_id: string | null }>;
    };
    expect(summaryBody.cases[TRACE_B]?.case_id ?? null).toBeNull();

    const traces = await asA("/v1/console/traces?limit=100");
    expect(traces.status).toBe(200);
    const tracesBody = (await traces.json()) as { traces: Array<{ trace_id: string }> };
    expect(tracesBody.traces.some((t) => t.trace_id === TRACE_B)).toBe(false);

    const approval = await asA(`/v1/console/approvals/${APPROVAL_B}`);
    expect(approval.status).toBe(404);

    const sources = await asA("/v1/console/sources");
    expect(sources.status).toBe(200);
    const sourcesBody = (await sources.json()) as { sources: Array<{ source_id: string }> };
    expect(sourcesBody.sources.some((s) => s.source_id === SOURCE_B)).toBe(false);

    const history = await asA(`/v1/console/sources/${SOURCE_B}/history`);
    expect(history.status).toBe(404);

    const exp = await asA(`/v1/console/compliance/exports/${EXPORT_B}`);
    expect(exp.status).toBe(404);
    const exportsList = await asA("/v1/console/compliance/exports");
    expect(exportsList.status).toBe(200);
    const exportsBody = (await exportsList.json()) as {
      exports: Array<{ export_id: string }>;
    };
    expect(exportsBody.exports.some((e) => e.export_id === EXPORT_B)).toBe(false);
  });

  it("cannot write org B approvals, sources, feeds, or settings", async () => {
    const approve = await asA(
      `/v1/console/approvals/${APPROVAL_B}/approve`,
      "POST",
      JSON.stringify({ reason: "cross-tenant" }),
    );
    expect(approve.status).toBeGreaterThanOrEqual(400);
    expect(approve.status).not.toBe(200);

    const still = await getPool().query<{ status: string }>(
      `SELECT status FROM approval WHERE approval_id = $1 AND organization_id = $2`,
      [APPROVAL_B, ORG_B_ID],
    );
    expect(still.rows[0]?.status).toBe("pending");

    const disable = await asA(
      `/v1/console/sources/${SOURCE_B}/disable`,
      "POST",
      JSON.stringify({ reason: "cross-tenant" }),
    );
    expect(disable.status).toBe(404);
    const source = await getPool().query<{ status: string }>(
      `SELECT status FROM source WHERE organization_id = $1 AND source_id = $2`,
      [ORG_B_ID, SOURCE_B],
    );
    expect(source.rows[0]?.status).toBe("active");

    const ingest = await asA(
      `/v1/console/reconciliation/feeds/${FEED_B}/ingest`,
      "POST",
      JSON.stringify({ body: "case_id\nnope\n", format: "csv" }),
    );
    expect(ingest.status).toBe(404);

    const hold = await asA(
      "/v1/console/organization/legal-hold",
      "PATCH",
      JSON.stringify({ legal_hold: true }),
    );
    expect(hold.status).toBe(200);
    const orgs = await getPool().query<{ organization_id: string; legal_hold: boolean; region: string }>(
      `SELECT organization_id, legal_hold, region FROM organization WHERE organization_id = ANY($1::uuid[])`,
      [[ORG_A_ID, ORG_B_ID]],
    );
    const b = orgs.rows.find((r) => r.organization_id === ORG_B_ID);
    const a = orgs.rows.find((r) => r.organization_id === ORG_A_ID);
    expect(b?.legal_hold).toBe(false);
    expect(b?.region).toBe("ap-southeast");
    expect(a?.legal_hold).toBe(true);

    const residency = await asA("/v1/console/organization/residency");
    expect(residency.status).toBe(200);
    const residencyBody = (await residency.json()) as { residency: { region: string } };
    expect(residencyBody.residency.region).toBe("eu-west");
  });
});
