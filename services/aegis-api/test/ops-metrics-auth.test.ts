import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("ops metrics auth", () => {
  it("refuses /metrics and /v1/ops/status without a token", async () => {
    const prev = process.env.OPS_METRICS_TOKEN;
    const prevPlat = process.env.PLATFORM_BOOTSTRAP_SECRET;
    process.env.OPS_METRICS_TOKEN = "test-ops-metrics-token";
    delete process.env.PLATFORM_BOOTSTRAP_SECRET;
    try {
      const app = createApp();
      for (const path of ["/metrics", "/v1/ops/status"]) {
        const res = await app.request(path);
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBe("unauthorized");
      }
    } finally {
      if (prev === undefined) delete process.env.OPS_METRICS_TOKEN;
      else process.env.OPS_METRICS_TOKEN = prev;
      if (prevPlat === undefined) delete process.env.PLATFORM_BOOTSTRAP_SECRET;
      else process.env.PLATFORM_BOOTSTRAP_SECRET = prevPlat;
    }
  });

  it("accepts Bearer OPS_METRICS_TOKEN", async () => {
    const prev = process.env.OPS_METRICS_TOKEN;
    process.env.OPS_METRICS_TOKEN = "test-ops-metrics-token";
    try {
      const app = createApp();
      const res = await app.request("/metrics", {
        headers: { Authorization: "Bearer test-ops-metrics-token" },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { auth?: string; service?: string };
      expect(body.service).toBe("aegis-api");
      expect(body.auth).toBe("ops_token_required");
    } finally {
      if (prev === undefined) delete process.env.OPS_METRICS_TOKEN;
      else process.env.OPS_METRICS_TOKEN = prev;
    }
  });
});
