import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSession, SALANOR_SESSION_COOKIE } from "@salanor/platform-auth";
import { app } from "../src/app.js";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

describeIfDb("insurance-api platform scaffold (Stage 11 exit)", () => {
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

  it("console overview requires session and returns scaffold payload", async () => {
    const { token } = await createSession(getPool(), USER, ORG);

    const unauth = await app.request("/v1/insurance/console/overview");
    expect(unauth.status).toBe(401);

    const response = await app.request("/v1/insurance/console/overview", {
      headers: { Cookie: `${SALANOR_SESSION_COOKIE}=${token}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      product: string;
      organization_id: string;
      scaffold: boolean;
    };
    expect(body.product).toBe("insurance");
    expect(body.organization_id).toBe(ORG);
    expect(body.scaffold).toBe(true);
  });
});
