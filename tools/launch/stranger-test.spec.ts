/**
 * Soft Playwright smoke for the public access-request gate.
 *
 * The release-blocking stranger path is `pnpm launch:stranger`
 * (services/aegis-api/scripts/run-stranger-test.mts) — already in quality-gate.
 * These specs only check the public form API shape when AEGIS_API_URL is up.
 */
import { test, expect } from "playwright/test";

const API = process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080";

test.describe("stranger public gate", () => {
  test("access-request accepts a work email", async ({ request }) => {
    const res = await request.post(`${API}/v1/public/access-request`, {
      data: {
        work_email: `stranger.${Date.now()}@example-bank.test`,
        company: "Example Bank Test",
        role: "Risk",
        country: "RW",
        use_case: "Evaluate sealed decisions in a sandbox",
        website: "",
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("personal email is refused", async ({ request }) => {
    const res = await request.post(`${API}/v1/public/access-request`, {
      data: {
        work_email: "person@gmail.com",
        company: "X",
        role: "X",
        country: "X",
        use_case: "long enough use case text",
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(String(body.message ?? "")).toMatch(/work email/i);
  });
});
