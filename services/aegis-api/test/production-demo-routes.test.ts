/**
 * With AEGIS_ENV=production every demo route refuses, even when someone leaves
 * AEGIS_DEMO_MODE=true behind (demo-reset-guard style). Boot would already have
 * failed; this is the runtime backstop.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { assertDemoMode, isDemoModeAllowed } from "../src/bank/demo-clock.js";

const KEYS = ["AEGIS_ENV", "NODE_ENV", "AEGIS_DEMO_MODE"] as const;
const prev = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

const DEMO_ROUTES: Array<[string, string]> = [
  ["POST", "/v1/aegis/demo/scenarios/run"],
  ["GET", "/v1/aegis/demo/simulator/stories"],
  ["POST", "/v1/aegis/demo/simulator/story"],
  ["POST", "/v1/aegis/demo/simulator/reset"],
  ["GET", "/v1/public/demo/sample-bundles"],
];

describe("demo routes in production", () => {
  for (const demoMode of ["true", "on", undefined]) {
    it(`refuse (AEGIS_ENV=production, AEGIS_DEMO_MODE=${demoMode ?? "unset"})`, async () => {
      process.env.AEGIS_ENV = "production";
      delete process.env.NODE_ENV;
      if (demoMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = demoMode;
      const app = createApp();
      for (const [method, path] of DEMO_ROUTES) {
        const res = await app.request(path, {
          method,
          headers: {
            Authorization: "Bearer anything",
            "Content-Type": "application/json",
          },
          body: method === "POST" ? "{}" : undefined,
        });
        expect([403, 404], `${method} ${path}`).toContain(res.status);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        expect(JSON.stringify(body)).not.toMatch(/stories"\s*:\s*\[/);
      }
    });
  }

  it("demo helpers refuse under AEGIS_ENV=production even with AEGIS_DEMO_MODE=true", () => {
    process.env.AEGIS_ENV = "production";
    delete process.env.NODE_ENV;
    process.env.AEGIS_DEMO_MODE = "true";
    expect(isDemoModeAllowed()).toBe(false);
    expect(() => assertDemoMode("demo:reset")).toThrow(/refused/);
  });
});
