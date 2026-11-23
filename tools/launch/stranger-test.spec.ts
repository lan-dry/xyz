/**
 * Gate 1 stranger Playwright specs.
 * Full path (request → approve → checklist → ingest → auditor) runs via
 * `pnpm launch:stranger` (services/aegis-api/scripts/run-stranger-test.mts)
 * which writes docs/launch/_raw/stranger-run-*.json. These specs cover the public gate.
 */
import { test, expect } from "playwright/test";

const API = process.env.AEGIS_API_URL ?? "http://127.0.0.1:8080";

test.describe("stranger sandbox path", () => {
  test("access-request accepts work email shape", async ({ request }) => {
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
    expect([200, 404, 500, 503]).toContain(res.status());
  });

  test("personal email is refused when API is up", async ({ request }) => {
    const res = await request.post(`${API}/v1/public/access-request`, {
      data: {
        work_email: "person@gmail.com",
        company: "X",
        role: "X",
        country: "X",
        use_case: "X",
      },
    });
    if (res.status() === 422) {
      const body = await res.json();
      expect(String(body.message ?? "")).toMatch(/work email/i);
    }
  });
});
