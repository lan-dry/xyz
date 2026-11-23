import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../src/db/load-env.js";
import { getPool, closePool } from "../src/db/pool.js";
import { runSandboxLifecycleTick } from "../src/tenants/sandbox-expiry-emails.js";
import { hashPassword } from "@salanor/platform-auth";

const CAPTURE = resolve(
  import.meta.dirname,
  "../../../docs/launch/_raw/_sandbox-expiry-capture",
);
const ARTIFACT = resolve(
  import.meta.dirname,
  "../../../docs/launch/_raw/sandbox-expiry-email-test.json",
);

describe("sandbox expiry emails", () => {
  beforeAll(() => {
    mkdirSync(CAPTURE, { recursive: true });
    process.env.SANDBOX_EXPIRY_EMAIL_CAPTURE_DIR = CAPTURE;
  });

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  it("emits 7d warning email and writes capture artifact", async () => {
    const pool = getPool();
    const orgId = randomUUID();
    const accountId = randomUUID();
    const membershipId = randomUUID();
    const slug = `sbx-exp-${Date.now().toString(36)}`;
    const expires = new Date(Date.now() + 5 * 24 * 3600_000);

    await pool.query(
      `INSERT INTO organization (
         organization_id, name, slug, tenant_kind, is_test,
         sandbox_expires_at, event_quota_daily, storage_quota_mb
       ) VALUES ($1, $2, $3, 'sandbox', true, $4, 5000, 512)`,
      [orgId, `Expiry ${slug}`, slug, expires.toISOString()],
    );
    await pool.query(
      `INSERT INTO account (account_id, email, display_name, password_hash, email_verified_at, active)
       VALUES ($1, $2, 'Sandbox Admin', $3, now(), true)`,
      [accountId, `admin-${slug}@example-bank.test`, hashPassword("ExpiryAdmin1!")],
    );
    await pool.query(
      `INSERT INTO membership (membership_id, account_id, organization_id, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')`,
      [membershipId, accountId, orgId],
    );

    const summary = await runSandboxLifecycleTick(pool, new Date());
    expect(summary.emails.some((e) => e.action === "email_7d")).toBe(true);
    expect(summary.emails[0]?.delivered).toBe("captured");

    const files = readdirSync(CAPTURE).filter((f) => f.includes("email_7d"));
    expect(files.length).toBeGreaterThan(0);
    const sample = JSON.parse(readFileSync(resolve(CAPTURE, files[0]!), "utf8")) as {
      subject: string;
      action: string;
    };
    expect(sample.action).toBe("email_7d");
    expect(sample.subject).toMatch(/7 days/i);

    mkdirSync(resolve(ARTIFACT, ".."), { recursive: true });
    writeFileSync(
      ARTIFACT,
      JSON.stringify(
        {
          ok: true,
          at: new Date().toISOString(),
          summary,
          sample_capture: sample,
        },
        null,
        2,
      ),
      "utf8",
    );

    // Cleanup capture dir contents for local reruns (keep committed artifact).
    for (const f of readdirSync(CAPTURE)) {
      rmSync(resolve(CAPTURE, f), { force: true });
    }
  });
});
