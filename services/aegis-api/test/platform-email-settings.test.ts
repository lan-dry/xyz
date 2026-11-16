import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import {
  getPlatformEmailSettings,
  PlatformEmailSettingsError,
  resolvePlatformEmailConfig,
  resolvePlatformEmailDelivery,
  savePlatformEmailSettings,
} from "@salanor/platform-auth";

/** Minimal in-memory stand-in for the platform_email_settings singleton row. */
function fakeClient() {
  let row: Record<string, unknown> | null = null;
  const client = {
    async query(sql: string, params: unknown[] = []) {
      if (/INSERT INTO platform_email_settings/.test(sql)) {
        row = {
          delivery: params[0],
          from_name: params[1],
          from_address: params[2],
          reply_to: params[3],
          resend_api_key_ciphertext: params[4],
          key_prefix: params[5],
          key_last4: params[6],
          smtp_host: params[7],
          smtp_port: params[8],
          smtp_secure: params[9],
          smtp_user: params[10],
          smtp_password_ciphertext: params[11],
          updated_at: new Date("2026-01-01T00:00:00Z"),
          updated_by: params[12],
        };
        return { rows: [] };
      }
      if (/FROM platform_email_settings/.test(sql)) {
        return { rows: row ? [row] : [] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  };
  return {
    client: client as unknown as pg.Pool,
    raw: () => row,
  };
}

const SECRET = "re_SuperSecretKey1234567890abcd";
const SMTP_PASS = "smtp-app-password-xyz";

describe("platform email settings (SMTP + Resend)", () => {
  beforeEach(() => {
    process.env.AEGIS_BRIDGE_MASTER_KEY = "m".repeat(40);
    delete process.env.RESEND_API_KEY;
    delete process.env.INVITE_EMAIL_FROM;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
    delete process.env.INVITE_EMAIL_FROM;
  });

  it("stores the Resend key encrypted and never serialises it", async () => {
    const { client, raw } = fakeClient();
    const view = await savePlatformEmailSettings(client, {
      delivery: "platform",
      fromAddress: "Meridian Clearing <notifications@meridian.example>",
      resendApiKey: SECRET,
      updatedBy: "ops@meridian.example",
    });

    expect(view.key_configured).toBe(true);
    expect(view.key_hint).toBe("re_…abcd");
    expect(view.from_address).toContain("meridian.example");
    expect(view.active_source).toBe("database");
    expect(view.delivery).toBe("platform");

    expect(JSON.stringify(view)).not.toContain(SECRET);
    expect(JSON.stringify(view)).not.toContain("ciphertext");
    const stored = String(raw()?.resend_api_key_ciphertext);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored).not.toContain(SECRET);

    const read = await getPlatformEmailSettings(client);
    expect(JSON.stringify(read)).not.toContain(SECRET);
    expect(Object.keys(read)).not.toContain("resend_api_key");
  });

  it("stores SMTP password encrypted and resolves smtp delivery", async () => {
    const { client, raw } = fakeClient();
    const view = await savePlatformEmailSettings(client, {
      delivery: "smtp",
      fromName: "Ops",
      fromAddress: "ops@bank.example",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "ops@bank.example",
      smtpPassword: SMTP_PASS,
    });

    expect(view.delivery).toBe("smtp");
    expect(view.active_source).toBe("smtp");
    expect(view.smtp_password_configured).toBe(true);
    expect(JSON.stringify(view)).not.toContain(SMTP_PASS);
    expect(String(raw()?.smtp_password_ciphertext).startsWith("v1.")).toBe(true);

    const resolved = await resolvePlatformEmailDelivery(client);
    expect(resolved.mode).toBe("smtp");
    expect(resolved.smtp?.host).toBe("smtp.office365.com");
    expect(resolved.smtp?.password).toBe(SMTP_PASS);
    expect(resolved.apiKey).toBeNull();
    expect(resolved.from).toContain("ops@bank.example");
  });

  it("refuses to save secrets when the master key is missing", async () => {
    delete process.env.AEGIS_BRIDGE_MASTER_KEY;
    const { client, raw } = fakeClient();
    await expect(
      savePlatformEmailSettings(client, { resendApiKey: SECRET }),
    ).rejects.toMatchObject({ code: "master_key_missing" });
    await expect(
      savePlatformEmailSettings(client, {
        delivery: "smtp",
        smtpPassword: SMTP_PASS,
      }),
    ).rejects.toMatchObject({ code: "master_key_missing" });
    expect(raw()).toBeNull();
  });

  it("validates the From address and key shape", async () => {
    const { client } = fakeClient();
    await expect(
      savePlatformEmailSettings(client, { fromAddress: "not an address" }),
    ).rejects.toBeInstanceOf(PlatformEmailSettingsError);
    await expect(
      savePlatformEmailSettings(client, { fromAddress: "a@b.co\r\nBcc: x@y.z" }),
    ).rejects.toBeInstanceOf(PlatformEmailSettingsError);
    await expect(
      savePlatformEmailSettings(client, { resendApiKey: "short" }),
    ).rejects.toBeInstanceOf(PlatformEmailSettingsError);
  });

  it("keeps the stored key when only the From address changes, and can clear it", async () => {
    const { client } = fakeClient();
    await savePlatformEmailSettings(client, { resendApiKey: SECRET });
    const kept = await savePlatformEmailSettings(client, {
      fromAddress: "ops@meridian.example",
    });
    expect(kept.key_configured).toBe(true);
    const cleared = await savePlatformEmailSettings(client, { clearKey: true });
    expect(cleared.key_configured).toBe(false);
    expect(cleared.key_hint).toBeNull();
  });

  it("resolve: database key wins over env; SMTP mode does not use Resend", async () => {
    const { client } = fakeClient();
    process.env.RESEND_API_KEY = "re_env_key_000000000000";
    process.env.INVITE_EMAIL_FROM = "Env <env@example.com>";

    const envOnly = await resolvePlatformEmailConfig(client);
    expect(envOnly).toMatchObject({
      apiKey: "re_env_key_000000000000",
      from: "Env <env@example.com>",
      keySource: "environment",
    });

    await savePlatformEmailSettings(client, {
      delivery: "platform",
      resendApiKey: SECRET,
      fromAddress: "Db <db@meridian.example>",
    });
    const db = await resolvePlatformEmailDelivery(client);
    expect(db).toMatchObject({
      mode: "resend",
      apiKey: SECRET,
      keySource: "database",
    });

    await savePlatformEmailSettings(client, {
      delivery: "smtp",
      smtpHost: "smtp.example.com",
      smtpUser: "mail@example.com",
      smtpPassword: SMTP_PASS,
      fromAddress: "mail@example.com",
    });
    const smtp = await resolvePlatformEmailDelivery(client);
    expect(smtp.mode).toBe("smtp");
    expect(smtp.apiKey).toBeNull();
    // Legacy helper ignores SMTP (Resend-shaped only).
    const legacy = await resolvePlatformEmailConfig(client);
    expect(legacy.apiKey).toBeNull();
  });

  it("resolve: undecryptable ciphertext or a missing table falls back to env", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.RESEND_API_KEY = "re_env_key_000000000000";
    const { client } = fakeClient();
    await savePlatformEmailSettings(client, {
      delivery: "platform",
      resendApiKey: SECRET,
    });

    process.env.AEGIS_BRIDGE_MASTER_KEY = "different-master-key-different-master-key";
    const rotated = await resolvePlatformEmailConfig(client);
    expect(rotated.keySource).toBe("environment");

    const noTable = {
      async query() {
        throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      },
    } as unknown as pg.Pool;
    expect((await resolvePlatformEmailConfig(noTable)).keySource).toBe("environment");
    expect((await resolvePlatformEmailConfig(null)).keySource).toBe("environment");
  });
});
