/**
 * Removed AEGIS_DEMO_MODE HTTP surfaces must 404 in every environment.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("removed demo-mode endpoints", () => {
  const app = createApp();

  const paths: Array<{ method: "GET" | "POST"; path: string }> = [
    { method: "POST", path: "/v1/aegis/demo/scenarios/run" },
    { method: "GET", path: "/v1/aegis/demo/simulator/stories" },
    { method: "POST", path: "/v1/aegis/demo/simulator/story" },
    { method: "POST", path: "/v1/aegis/demo/simulator/reset" },
  ];

  for (const { method, path } of paths) {
    it(`${method} ${path} returns 404`, async () => {
      const res = await app.request(path, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined,
      });
      expect(res.status).toBe(404);
    });
  }
});
