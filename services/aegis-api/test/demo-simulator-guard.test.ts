import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SIMULATOR_STORIES } from "../src/demo/simulator-stories.js";

const PATHS: Array<[string, string]> = [
  ["GET", "/v1/aegis/demo/simulator/stories"],
  ["POST", "/v1/aegis/demo/simulator/story"],
  ["POST", "/v1/aegis/demo/simulator/reset"],
];

const prev = {
  mode: process.env.AEGIS_DEMO_MODE,
  node: process.env.NODE_ENV,
  aegis: process.env.AEGIS_ENV,
};

afterEach(() => {
  for (const [k, v] of [
    ["AEGIS_DEMO_MODE", prev.mode],
    ["NODE_ENV", prev.node],
    ["AEGIS_ENV", prev.aegis],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("simulator routes are demo-only", () => {
  it("refuse with 403 when demo mode is off", async () => {
    delete process.env.AEGIS_DEMO_MODE;
    const app = createApp();
    for (const [method, path] of PATHS) {
      const res = await app.request(path, {
        method,
        headers: { Authorization: "Bearer anything", "Content-Type": "application/json" },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(res.status).toBe(403);
      expect(((await res.json()) as { error: string }).error).toBe("demo_mode_required");
    }
  });

  it("refuse with 403 in production even if demo mode is on", async () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "production";
    const app = createApp();
    const res = await app.request("/v1/aegis/demo/simulator/story", {
      method: "POST",
      headers: { Authorization: "Bearer anything" },
      body: "{}",
    });
    expect(res.status).toBe(403);
  });

  it("require an ingest bearer when demo mode is on", async () => {
    process.env.AEGIS_DEMO_MODE = "true";
    delete process.env.NODE_ENV;
    delete process.env.AEGIS_ENV;
    const app = createApp();
    for (const [method, path] of PATHS) {
      const res = await app.request(path, {
        method,
        body: method === "POST" ? "{}" : undefined,
      });
      expect(res.status).toBe(401);
    }
  });
});

describe("simulator stories", () => {
  it("are synthetic RWF data with unique ids", () => {
    const ids = new Set(SIMULATOR_STORIES.map((s) => s.id));
    expect(ids.size).toBe(SIMULATOR_STORIES.length);
    for (const s of SIMULATOR_STORIES) {
      expect(s.attributes.currency).toBe("RWF");
      expect(typeof s.attributes.amount).toBe("number");
    }
    expect(SIMULATOR_STORIES.some((s) => s.expect === "allow")).toBe(true);
    expect(SIMULATOR_STORIES.some((s) => s.expect === "hold")).toBe(true);
  });
});
