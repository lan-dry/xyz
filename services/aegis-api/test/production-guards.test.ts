import { describe, expect, it } from "vitest";
import {
  assertProductionBoot,
  evaluateProductionGuards,
  ProductionGuardError,
  type DatabaseRoleProbe,
} from "../src/boot/production-guards.js";

const SEED_B64 = Buffer.alloc(32, 7).toString("base64");
const KMS_ARN =
  "arn:aws:kms:eu-west-1:111122223333:key/11111111-2222-3333-4444-555555555555";

const safeProbe = async (): Promise<DatabaseRoleProbe> => ({
  role: "aegis_app",
  superuser: false,
  canSetReplicationRole: false,
  ownsAppendOnlyTables: false,
});

/** A production env that passes every guard (Plan A: KMS). */
function goodEnv(extra: Record<string, string | undefined> = {}) {
  return {
    AEGIS_ENV: "production",
    DATABASE_URL: "postgresql://aegis_app:pw@db.internal:5432/aegis",
    CONSOLE_ORIGIN: "https://console.example.com",
    RESEND_API_KEY: "re_test_not_a_real_key",
    AEGIS_RECEIPT_KMS_KEY_ID: KMS_ARN,
    AEGIS_RECEIPT_KEY_ID: "receipt_prod_2026",
    AEGIS_TSA_URL: "http://timestamp.sectigo.com",
    AEGIS_BRIDGE_MASTER_KEY: "x".repeat(40),
    ...extra,
  };
}

const codes = (r: { failures: Array<{ code: string }> }) =>
  r.failures.map((f) => f.code);

describe("production guards", () => {
  it("does nothing outside AEGIS_ENV=production", async () => {
    const report = await evaluateProductionGuards(
      { AEGIS_DEMO_MODE: "true" },
      { probeDatabaseRole: safeProbe },
    );
    expect(report.production).toBe(false);
    expect(report.ok).toBe(true);
  });

  it("passes a fully configured KMS production env", async () => {
    const report = await evaluateProductionGuards(goodEnv(), {
      probeDatabaseRole: safeProbe,
    });
    expect(codes(report)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it.each(["true", "on", "1", "yes", "TRUE", " On "])(
    "refuses AEGIS_DEMO_MODE=%s",
    async (value) => {
      const report = await evaluateProductionGuards(
        goodEnv({ AEGIS_DEMO_MODE: value }),
        { probeDatabaseRole: safeProbe },
      );
      expect(codes(report)).toContain("demo_mode_on");
    },
  );

  it("accepts AEGIS_DEMO_MODE=false / unset", async () => {
    for (const v of ["false", "off", "0", undefined]) {
      const report = await evaluateProductionGuards(
        goodEnv({ AEGIS_DEMO_MODE: v }),
        { probeDatabaseRole: safeProbe },
      );
      expect(codes(report)).not.toContain("demo_mode_on");
    }
  });

  it("refuses the receipt_dev key id even with KMS", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({ AEGIS_RECEIPT_KEY_ID: "receipt_dev" }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toContain("receipt_dev_key");
  });

  it("refuses a software key without the interim flag (and no KMS)", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_RECEIPT_SIGNING_KEY_B64: SEED_B64,
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toContain("kms_not_configured");
    expect(report.ok).toBe(false);
  });

  it("refuses when KMS is unset and the interim flag is unset", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({ AEGIS_RECEIPT_KMS_KEY_ID: undefined }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toContain("kms_not_configured");
  });

  it("allows the interim software key only with =interim, and warns", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_RECEIPT_SIGNING_KEY_B64: SEED_B64,
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toEqual([]);
    expect(report.warnings.join(" ")).toMatch(/software key \(interim\)/);
  });

  it("rejects other values of the interim flag", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_RECEIPT_SIGNING_KEY_B64: SEED_B64,
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "true",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toContain("interim_flag_invalid");
    expect(codes(report)).toContain("kms_not_configured");
  });

  it("interim mode still needs a valid 32-byte seed and a non-dev key id", async () => {
    const noSeed = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(noSeed)).toContain("software_key_missing");
    const short = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_RECEIPT_SIGNING_KEY_B64: Buffer.alloc(8).toString("base64"),
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(short)).toContain("software_key_invalid");
    const dev = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: undefined,
        AEGIS_RECEIPT_KEY_ID: undefined,
        AEGIS_RECEIPT_SIGNING_KEY_B64: SEED_B64,
        AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(dev)).toContain("receipt_dev_key");
  });

  it("requires a region when the KMS key id is not an ARN", async () => {
    const bare = await evaluateProductionGuards(
      goodEnv({ AEGIS_RECEIPT_KMS_KEY_ID: "1234abcd-12ab-34cd-56ef-1234567890ab" }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(bare)).toContain("kms_region_missing");
    const withRegion = await evaluateProductionGuards(
      goodEnv({
        AEGIS_RECEIPT_KMS_KEY_ID: "1234abcd-12ab-34cd-56ef-1234567890ab",
        AWS_REGION: "eu-west-1",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(withRegion)).not.toContain("kms_region_missing");
  });

  it("refuses missing DATABASE_URL, console origin and email provider", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({
        DATABASE_URL: undefined,
        CONSOLE_ORIGIN: undefined,
        RESEND_API_KEY: undefined,
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).toEqual(
      expect.arrayContaining([
        "database_url_missing",
        "console_origin_missing",
        "email_provider_missing",
      ]),
    );
  });

  it("accepts CONSOLE_PUBLIC_URL instead of CONSOLE_ORIGIN", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({
        CONSOLE_ORIGIN: undefined,
        CONSOLE_PUBLIC_URL: "https://console.example.com",
      }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).not.toContain("console_origin_missing");
  });

  it("accepts a Resend key saved in the database (Platform admin > Email) as an email provider", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({ RESEND_API_KEY: undefined }),
      { probeDatabaseRole: safeProbe, hasDatabaseEmailProvider: async () => true },
    );
    expect(codes(report)).not.toContain("email_provider_missing");

    const none = await evaluateProductionGuards(
      goodEnv({ RESEND_API_KEY: undefined }),
      { probeDatabaseRole: safeProbe, hasDatabaseEmailProvider: async () => false },
    );
    expect(codes(none)).toContain("email_provider_missing");

    const broken = await evaluateProductionGuards(
      goodEnv({ RESEND_API_KEY: undefined }),
      {
        probeDatabaseRole: safeProbe,
        hasDatabaseEmailProvider: async () => {
          throw new Error("db down");
        },
      },
    );
    expect(codes(broken)).toContain("email_provider_missing");
  });

  it("lets email be switched off explicitly", async () => {
    const report = await evaluateProductionGuards(
      goodEnv({ RESEND_API_KEY: undefined, AEGIS_EMAIL_REQUIRED: "false" }),
      { probeDatabaseRole: safeProbe },
    );
    expect(codes(report)).not.toContain("email_provider_missing");
  });

  it("refuses a superuser database role", async () => {
    const report = await evaluateProductionGuards(goodEnv(), {
      probeDatabaseRole: async () => ({
        role: "postgres",
        superuser: true,
        canSetReplicationRole: true,
        ownsAppendOnlyTables: true,
      }),
    });
    expect(codes(report)).toContain("database_superuser");
  });

  it("refuses a non-superuser that can SET session_replication_role", async () => {
    const report = await evaluateProductionGuards(goodEnv(), {
      probeDatabaseRole: async () => ({
        role: "app_with_grant",
        superuser: false,
        canSetReplicationRole: true,
        ownsAppendOnlyTables: false,
      }),
    });
    expect(codes(report)).toEqual(["database_can_set_replication_role"]);
  });

  it("refuses when the database cannot be reached to verify the role", async () => {
    const report = await evaluateProductionGuards(goodEnv(), {
      probeDatabaseRole: async () => ({
        role: null,
        superuser: null,
        canSetReplicationRole: null,
        ownsAppendOnlyTables: null,
        error: "Error",
      }),
    });
    expect(codes(report)).toContain("database_role_unverified");
  });

  it("warns (not fails) when the probe is inconclusive or the role owns the tables", async () => {
    const report = await evaluateProductionGuards(goodEnv(), {
      probeDatabaseRole: async () => ({
        role: "owner",
        superuser: false,
        canSetReplicationRole: null,
        ownsAppendOnlyTables: true,
      }),
    });
    expect(report.ok).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/inconclusive/);
    expect(report.warnings.join(" ")).toMatch(/owns event\/forensic_receipt/);
  });

  it("assertProductionBoot throws one error listing every problem, with no secret values", async () => {
    const env = goodEnv({
      AEGIS_DEMO_MODE: "true",
      AEGIS_RECEIPT_KMS_KEY_ID: undefined,
      AEGIS_RECEIPT_SIGNING_KEY_B64: SEED_B64,
      CONSOLE_ORIGIN: undefined,
    });
    await expect(
      assertProductionBoot(env, { probeDatabaseRole: safeProbe }),
    ).rejects.toBeInstanceOf(ProductionGuardError);
    try {
      await assertProductionBoot(env, { probeDatabaseRole: safeProbe });
    } catch (err) {
      const text = (err as Error).message;
      expect(text).toMatch(/demo_mode_on/);
      expect(text).toMatch(/kms_not_configured/);
      expect(text).toMatch(/console_origin_missing/);
      expect(text).not.toContain(SEED_B64);
      expect(text).not.toContain("re_test_not_a_real_key");
      expect(text).not.toContain("postgresql://");
    }
  });

  it("assertProductionBoot passes a good env and returns warnings", async () => {
    const report = await assertProductionBoot(
      goodEnv({ AEGIS_TSA_URL: undefined }),
      { probeDatabaseRole: safeProbe },
    );
    expect(report.ok).toBe(true);
    expect(report.warnings.join(" ")).toMatch(/AEGIS_TSA_URL/);
  });
});
