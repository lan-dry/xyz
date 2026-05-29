import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSession,
  resolveSession,
  resolveSessionViaId,
} from "@salanor/platform-auth";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP = "22222222-2222-4222-8222-222222222222";

describeIfDb("Salanor ID (Stage 12 — membership)", () => {
  beforeAll(async () => {
    const seedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../tools/seed/dev.sql",
    );
    await getPool().query(readFileSync(seedPath, "utf8"));
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates and resolves a console session", async () => {
    const account = await getPool().query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = 'dev@salanor.local'`,
    );
    const accountId = account.rows[0]?.account_id;
    expect(accountId).toBeTruthy();

    const { token, session } = await createSession(getPool(), accountId!, ORG);
    expect(session.email).toBe("dev@salanor.local");

    const resolved = await resolveSession(getPool(), token);
    expect(resolved?.userId).toBe(MEMBERSHIP);
  });

  it("validate endpoint contract matches resolveSessionViaId when ID is up", async () => {
    const idUrl = process.env.SALANOR_ID_URL;
    if (!idUrl) {
      return;
    }

    const account = await getPool().query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = 'dev@salanor.local'`,
    );
    const accountId = account.rows[0]?.account_id;
    if (!accountId) {
      return;
    }

    const { token } = await createSession(getPool(), accountId, ORG);
    const remote = await resolveSessionViaId(idUrl, token);
    const local = await resolveSession(getPool(), token);
    expect(remote?.userId).toBe(local?.userId);
  });
});
