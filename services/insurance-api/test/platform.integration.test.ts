import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, SALANOR_SESSION_COOKIE } from "@salanor/platform-auth";
import { app } from "../src/app.js";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import {
  applyIntegrationFixture,
  INTEGRATION_MEMBERSHIP_A,
  INTEGRATION_ORG_A,
} from "../../aegis-api/test/integration-fixture.js";
import { insertTestAdmin } from "../../aegis-api/test/insert-test-admin.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = INTEGRATION_ORG_A;
const USER = INTEGRATION_MEMBERSHIP_A;

describeIfDb("insurance-api platform scaffold (Stage 11 exit)", () => {
  beforeAll(async () => {
    await applyIntegrationFixture(getPool());
    await insertTestAdmin(getPool(), {
      organizationId: INTEGRATION_ORG_A,
      membershipId: INTEGRATION_MEMBERSHIP_A,
      password: "vitest-insurance-pass-12",
    });
  });

  afterAll(async () => {
    await closePool();
  });

  it("health reports insurance product stage 11", async () => {
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      service: string;
      product: string;
      stage: number;
    };
    expect(body.service).toBe("insurance-api");
    expect(body.product).toBe("insurance");
    expect(body.stage).toBe(11);
  });

  it("requires session cookie for protected route", async () => {
    const response = await app.request("/v1/insurance/policies");
    expect(response.status).toBe(401);
  });

  it("returns policies for authenticated session", async () => {
    const account = await getPool().query<{ account_id: string }>(
      `SELECT account_id FROM membership WHERE membership_id = $1`,
      [USER],
    );
    const accountId = account.rows[0]?.account_id;
    expect(accountId).toBeTruthy();

    const { token } = await createSession(getPool(), accountId!, ORG);
    const response = await app.request("/v1/insurance/policies", {
      headers: { Cookie: `${SALANOR_SESSION_COOKIE}=${token}` },
    });
    expect(response.status).toBe(200);
  });
});
