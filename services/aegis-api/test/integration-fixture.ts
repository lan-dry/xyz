import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../tools/seed/integration-fixture.sql",
);

export const INTEGRATION_ORG_A = "11111111-1111-4111-8111-111111111111";
export const INTEGRATION_ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const INTEGRATION_MEMBERSHIP_A = "22222222-2222-4222-8222-222222222222";
export const INTEGRATION_MEMBERSHIP_B = "33333333-3333-4333-8333-333333333334";

/** Demo org/agent/keys for vitest and optional local pilot — no accounts. */
export async function applyIntegrationFixture(
  client: pg.Pool | pg.PoolClient,
): Promise<void> {
  await client.query(readFileSync(FIXTURE_PATH, "utf8"));
}
