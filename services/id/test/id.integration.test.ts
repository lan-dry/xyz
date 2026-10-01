import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSession,
  resolveSession,
  resolveSessionViaId,
} from "@salanor/platform-auth";
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

const VITEST_PASSWORD = "vitest-id-pass-12";

describeIfDb("Salanor ID (Stage 12 — membership)", () => {
  beforeAll(async () => {
    await applyIntegrationFixture(getPool());
    await insertTestAdmin(getPool(), {
      organizationId: INTEGRATION_ORG_A,
      membershipId: INTEGRATION_MEMBERSHIP_A,
      password: VITEST_PASSWORD,
    });
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates and resolves a console session", async () => {
    const membership = await getPool().query<{ account_id: string; email: string }>(
      `SELECT m.account_id, a.email
       FROM membership m
       JOIN account a ON a.account_id = m.account_id
       WHERE m.membership_id = $1`,
      [INTEGRATION_MEMBERSHIP_A],
    );
    const row = membership.rows[0];
    expect(row).toBeTruthy();

    const { token, session } = await createSession(
      getPool(),
      row!.account_id,
      INTEGRATION_ORG_A,
    );
    expect(session.email).toBe(row!.email);

    const resolved = await resolveSession(getPool(), token);
    expect(resolved?.userId).toBe(INTEGRATION_MEMBERSHIP_A);
  });

  it("validate endpoint contract matches resolveSessionViaId when ID is up", async () => {
    const idUrl = process.env.SALANOR_ID_URL;
    if (!idUrl) {
      return;
    }

    const membership = await getPool().query<{ account_id: string }>(
      `SELECT account_id FROM membership WHERE membership_id = $1`,
      [INTEGRATION_MEMBERSHIP_A],
    );
    const accountId = membership.rows[0]?.account_id;
    if (!accountId) {
      return;
    }

    const { token } = await createSession(getPool(), accountId, INTEGRATION_ORG_A);
    const remote = await resolveSessionViaId(idUrl, token);
    const local = await resolveSession(getPool(), token);
    expect(remote?.userId).toBe(local?.userId);
  });
});
