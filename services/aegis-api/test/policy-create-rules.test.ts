/**
 * Regression: console policy create requires name + non-empty rules (422
 * otherwise) — scenario 9 HTTP root cause.
 */
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  demoApprovalPassword,
  seedDemoApprovalActors,
} from "../src/demo/seed-approval-actors.js";
import { consoleRoutes } from "../src/routes/console/index.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";
import { seedAuthorityFromPack } from "../src/bank/repo.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;

describeIfDb("policy create requires rules", () => {
  const prevDemo = process.env.AEGIS_DEMO_MODE;
  const prevPass = process.env.AEGIS_DEMO_APPROVAL_PASSWORD;

  beforeAll(async () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.AEGIS_DEMO_APPROVAL_PASSWORD =
      prevPass && prevPass.length >= 10
        ? prevPass
        : "test-demo-approval-password";
    await migrateUp();
    const pool = getPool();
    await applyIntegrationFixture(pool);
    const pack = loadDemoPack("banking");
    const client = await pool.connect();
    try {
      await seedAuthorityFromPack(
        client,
        ORG,
        packRoles(pack),
        packMatrixRows(pack),
      );
      await seedDemoApprovalActors(client, ORG);
      await client.query(
        `UPDATE membership m SET role = 'admin'
         FROM account a
         WHERE a.account_id = m.account_id
           AND m.organization_id = $1
           AND lower(a.email) = 'manager@demo.test'`,
        [ORG],
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (prevDemo === undefined) delete process.env.AEGIS_DEMO_MODE;
    else process.env.AEGIS_DEMO_MODE = prevDemo;
    if (prevPass === undefined) delete process.env.AEGIS_DEMO_APPROVAL_PASSWORD;
    else process.env.AEGIS_DEMO_APPROVAL_PASSWORD = prevPass;
    await closePool();
  });

  async function loginCookie(app: Hono) {
    const res = await app.request("/v1/console/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "manager@demo.test",
        password: demoApprovalPassword(),
      }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/aegis_session=([^;]+)/);
    expect(match).toBeTruthy();
    return match![1]!;
  }

  it("returns 422 without rules; 201 with rules", async () => {
    const app = new Hono();
    app.route("/v1/console", consoleRoutes);
    const cookie = await loginCookie(app);

    const bad = await app.request("/v1/console/policies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `aegis_session=${cookie}`,
      },
      body: JSON.stringify({
        name: `No rules ${Date.now()}`,
        environment: "production",
      }),
    });
    expect(bad.status).toBe(422);

    const ok = await app.request("/v1/console/policies", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `aegis_session=${cookie}`,
      },
      body: JSON.stringify({
        name: `With rules ${Date.now()}`,
        environment: "production",
        rules: [
          {
            tool_pattern: "governed.action",
            decision: "allow",
            priority: 10,
          },
        ],
      }),
    });
    expect(ok.status).toBe(201);
    const body = (await ok.json()) as { policy?: { policy_id: string } };
    expect(body.policy?.policy_id).toBeTruthy();
  });
});
