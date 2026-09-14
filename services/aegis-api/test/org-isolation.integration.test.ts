import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import { countEventsByOrganization, listEventsByOrganization } from "../src/repo/events.js";
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

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb("TestOrgIsolation", () => {
  beforeAll(async () => {
    await migrateUp();
    const client = await getPool().connect();
    try {
      await cleanupIsolationFixtures(client);
      await insertOrganization(client, ORG_A_ID, "test-org-a");
      await insertOrganization(client, ORG_B_ID, "test-org-b");
      await insertAgent(client, "agent-test-a", ORG_A_ID, "a");
      await insertAgent(client, "agent-test-b", ORG_B_ID, "b");
      await insertSigningKey(client, "key-test-a", "agent-test-a", ORG_A_ID);
      await insertSigningKey(client, "key-test-b", "agent-test-b", ORG_B_ID);
      await insertTrace(client, "trace-test-a", ORG_A_ID, "agent-test-a");
      await insertTrace(client, "trace-test-b", ORG_B_ID, "agent-test-b");
      await insertEvent(client, {
        eventId: "evt-test-a1",
        organizationId: ORG_A_ID,
        traceId: "trace-test-a",
        agentId: "agent-test-a",
        keyId: "key-test-a",
        sequenceNum: 1,
      });
      await insertEvent(client, {
        eventId: "evt-test-b1",
        organizationId: ORG_B_ID,
        traceId: "trace-test-b",
        agentId: "agent-test-b",
        keyId: "key-test-b",
        sequenceNum: 1,
      });
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    const client = await getPool().connect();
    try {
      await cleanupIsolationFixtures(client);
    } finally {
      client.release();
    }
    await closePool();
  });

  it("org A cannot read org B events", async () => {
    const eventsA = await listEventsByOrganization(getPool(), ORG_A_ID);
    const eventsB = await listEventsByOrganization(getPool(), ORG_B_ID);

    expect(eventsA.map((e) => e.event_id)).toEqual(["evt-test-a1"]);
    expect(eventsB.map((e) => e.event_id)).toEqual(["evt-test-b1"]);

    const idsA = new Set(eventsA.map((e) => e.organization_id));
    const idsB = new Set(eventsB.map((e) => e.organization_id));
    expect(idsA).toEqual(new Set([ORG_A_ID]));
    expect(idsB).toEqual(new Set([ORG_B_ID]));
    expect(eventsA.some((e) => e.organization_id === ORG_B_ID)).toBe(false);
    expect(eventsB.some((e) => e.organization_id === ORG_A_ID)).toBe(false);
  });

  it("event counts are scoped per organization", async () => {
    expect(await countEventsByOrganization(getPool(), ORG_A_ID)).toBe(1);
    expect(await countEventsByOrganization(getPool(), ORG_B_ID)).toBe(1);
  });
});
