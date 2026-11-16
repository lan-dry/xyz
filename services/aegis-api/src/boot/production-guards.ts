/**
 * Production start-up guards (AEGIS_ENV=production).
 *
 * Called from src/index.ts before the server listens. Every failure is
 * collected and reported together; messages name the env var and the problem,
 * never a secret value. A failed guard means the process exits non-zero.
 *
 * Refuses to boot when:
 *  - AEGIS_DEMO_MODE is on (true / on / 1 / yes)
 *  - the receipt key id is `receipt_dev`
 *  - receipts would be signed by a software key without
 *    AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim
 *  - KMS is not configured and the interim flag is not set
 *  - DATABASE_URL is missing, or its role is a superuser / can SET
 *    session_replication_role (best-effort probe, see probeDatabaseRole)
 *  - CONSOLE_ORIGIN (or CONSOLE_PUBLIC_URL) is missing
 *  - an email provider is required (default) and none is configured
 */
import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import pg from "pg";
import {
  DEV_RECEIPT_KEY_ID,
  derivedKmsReceiptKeyId,
} from "../crypto/receipt-signing.js";
import { regionFromKmsKeyId } from "../crypto/kms-ed25519.js";
import {
  INTERIM_SOFTWARE_KEY_VALUE,
  isInterimSoftwareKeyAllowed,
  isProductionEnv,
  isTruthyFlag,
} from "./production-env.js";

type Env = Record<string, string | undefined>;

export type GuardFailure = { code: string; message: string };

export type GuardReport = {
  production: boolean;
  ok: boolean;
  failures: GuardFailure[];
  warnings: string[];
};

export class ProductionGuardError extends Error {
  constructor(readonly failures: GuardFailure[]) {
    super(
      `Refusing to start in production (${failures.length} problem${failures.length === 1 ? "" : "s"}):\n` +
        failures.map((f) => `  - [${f.code}] ${f.message}`).join("\n"),
    );
    this.name = "ProductionGuardError";
  }
}

export type DatabaseRoleProbe = {
  /** Role name (not a secret). */
  role: string | null;
  superuser: boolean | null;
  /** true when `SET LOCAL session_replication_role` succeeded (it is rolled back). */
  canSetReplicationRole: boolean | null;
  /** Application role owns event/forensic_receipt (can ALTER TABLE ... DISABLE TRIGGER). */
  ownsAppendOnlyTables: boolean | null;
  error?: string;
};

export type ProductionGuardDeps = {
  /** Injected in tests; defaults to a real connection using DATABASE_URL. */
  probeDatabaseRole?: (databaseUrl: string) => Promise<DatabaseRoleProbe>;
  /**
   * True when Platform admin > Email can deliver (SMTP complete or Resend key stored).
   * Supplied by src/index.ts at boot; when absent only RESEND_API_KEY counts.
   */
  hasDatabaseEmailProvider?: () => Promise<boolean>;
};

/**
 * Best-effort check of what the application's database role can do.
 *
 *  - superuser: `pg_roles.rolsuper` for current_user.
 *  - session_replication_role: attempts `SET LOCAL session_replication_role =
 *    'origin'` inside a transaction that is always rolled back. 'origin' is the
 *    default, so the probe changes nothing, but Postgres still rejects the
 *    statement (42501) for roles that may not set the parameter. Works on all
 *    supported Postgres versions.
 *  - table ownership: informational (owners can disable triggers).
 *
 * Limits: it reflects the role at boot only (a later GRANT is not seen); a
 * pooler that maps roles per request can hide the real role; and it cannot
 * detect other bypass routes such as a second superuser connection string.
 * Keep the role least-privileged in the database too (docs/APPEND_ONLY.md).
 */
export async function probeDatabaseRole(
  databaseUrl: string,
): Promise<DatabaseRoleProbe> {
  const client = new pg.Client({
    connectionString: normalizePostgresDatabaseUrl(databaseUrl),
    connectionTimeoutMillis: 8_000,
  });
  const probe: DatabaseRoleProbe = {
    role: null,
    superuser: null,
    canSetReplicationRole: null,
    ownsAppendOnlyTables: null,
  };
  try {
    await client.connect();
    const who = await client.query<{ role: string; rolsuper: boolean }>(
      `SELECT current_user AS role, r.rolsuper
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    probe.role = who.rows[0]?.role ?? null;
    probe.superuser = who.rows[0]?.rolsuper ?? null;

    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL session_replication_role = 'origin'");
      probe.canSetReplicationRole = true;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 42501 insufficient_privilege: the role cannot set it (the safe outcome).
      probe.canSetReplicationRole = code === "42501" ? false : null;
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
    }

    try {
      const owned = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname IN ('event', 'forensic_receipt')
           AND c.relkind = 'r'
           AND n.nspname = current_schema()
           AND pg_get_userbyid(c.relowner) = current_user`,
      );
      probe.ownsAppendOnlyTables = Number(owned.rows[0]?.n ?? 0) > 0;
    } catch {
      probe.ownsAppendOnlyTables = null;
    }
  } catch (err) {
    probe.error = err instanceof Error ? err.name : "connection_failed";
  } finally {
    await client.end().catch(() => undefined);
  }
  return probe;
}

function hasEmailProvider(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY?.trim());
}

function looksLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Evaluate every guard. Pure apart from the optional database probe. */
export async function evaluateProductionGuards(
  env: Env = process.env,
  deps: ProductionGuardDeps = {},
): Promise<GuardReport> {
  const production = isProductionEnv(env);
  const failures: GuardFailure[] = [];
  const warnings: string[] = [];
  if (!production) return { production, ok: true, failures, warnings };

  const fail = (code: string, message: string) => failures.push({ code, message });

  // Demo mode
  if (isTruthyFlag(env.AEGIS_DEMO_MODE)) {
    fail(
      "demo_mode_on",
      "AEGIS_DEMO_MODE must not be on in production (demo routes, demo clock and seeded accounts are demo-only)",
    );
  }

  // Receipt signing key
  const kmsKeyId = env.AEGIS_RECEIPT_KMS_KEY_ID?.trim() ?? "";
  const kmsConfigured = kmsKeyId.length > 0;
  const interimRaw = env.AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION?.trim();
  const interim = isInterimSoftwareKeyAllowed(env);
  const keyId =
    env.AEGIS_RECEIPT_KEY_ID?.trim() ||
    (kmsConfigured ? derivedKmsReceiptKeyId(kmsKeyId) : DEV_RECEIPT_KEY_ID);

  if (interimRaw && !interim) {
    fail(
      "interim_flag_invalid",
      `AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION only accepts "${INTERIM_SOFTWARE_KEY_VALUE}"`,
    );
  }
  if (keyId === DEV_RECEIPT_KEY_ID) {
    fail(
      "receipt_dev_key",
      `Receipt key id "${DEV_RECEIPT_KEY_ID}" is a development key; set AEGIS_RECEIPT_KEY_ID to a production key id`,
    );
  }
  if (kmsConfigured) {
    if (!regionFromKmsKeyId(kmsKeyId)) {
      const region =
        env.AEGIS_RECEIPT_KMS_REGION?.trim() ||
        env.AWS_REGION?.trim() ||
        env.AWS_DEFAULT_REGION?.trim();
      if (!region) {
        fail(
          "kms_region_missing",
          "AEGIS_RECEIPT_KMS_KEY_ID is not an ARN and no region is set (AEGIS_RECEIPT_KMS_REGION or AWS_REGION)",
        );
      }
    }
    if (env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim()) {
      warnings.push(
        "AEGIS_RECEIPT_SIGNING_KEY_B64 is set but ignored because KMS is configured; remove the software key from the environment",
      );
    }
  } else {
    // Plan B only: software key, and only with the explicit interim flag.
    if (!interim) {
      fail(
        "kms_not_configured",
        "AEGIS_RECEIPT_KMS_KEY_ID is not set and AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION=interim is not set; refusing to sign receipts with a software key",
      );
    } else {
      const seedB64 = env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim();
      if (!seedB64) {
        fail(
          "software_key_missing",
          "Interim software key mode needs AEGIS_RECEIPT_SIGNING_KEY_B64 (32-byte Ed25519 seed, base64)",
        );
      } else if (Buffer.from(seedB64, "base64").length !== 32) {
        fail(
          "software_key_invalid",
          "AEGIS_RECEIPT_SIGNING_KEY_B64 must decode to exactly 32 bytes",
        );
      } else {
        warnings.push(
          "Receipts are signed with a software key (interim). Receipts and Verify will say \"Key custody: software key (interim)\". Move to AWS KMS.",
        );
      }
    }
  }
  if (env.DEV_SIGNING_PRIVATE_KEY_B64?.trim()) {
    warnings.push(
      "DEV_SIGNING_PRIVATE_KEY_B64 is set in production; it is a development fallback and should be removed",
    );
  }

  // Required service configuration
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) fail("database_url_missing", "DATABASE_URL is not set");

  const consoleOrigin =
    env.CONSOLE_ORIGIN?.trim() || env.CONSOLE_PUBLIC_URL?.trim();
  if (!consoleOrigin) {
    fail(
      "console_origin_missing",
      "CONSOLE_ORIGIN (or CONSOLE_PUBLIC_URL) is not set; CORS and approval links need the public console URL",
    );
  } else if (looksLocal(consoleOrigin)) {
    warnings.push("CONSOLE_ORIGIN points at localhost in production");
  }

  const emailRequired = (env.AEGIS_EMAIL_REQUIRED ?? "true").trim().toLowerCase() !== "false";
  if (emailRequired && !hasEmailProvider(env)) {
    let inDatabase = false;
    if (deps.hasDatabaseEmailProvider) {
      try {
        inDatabase = await deps.hasDatabaseEmailProvider();
      } catch {
        inDatabase = false;
      }
    }
    if (!inDatabase) {
      fail(
        "email_provider_missing",
        "No email provider configured (Platform admin > Email SMTP or Resend, or RESEND_API_KEY). Approval and invite emails need one; set AEGIS_EMAIL_REQUIRED=false only if email is intentionally off",
      );
    }
  }

  if (!env.AEGIS_TSA_URL?.trim()) {
    warnings.push(
      "AEGIS_TSA_URL is not set: receipts carry signing time only, no outside trusted-time stamp",
    );
  }
  if (!env.AEGIS_BRIDGE_MASTER_KEY?.trim()) {
    warnings.push(
      "AEGIS_BRIDGE_MASTER_KEY is not set: Approve/Reject and Workflow Bridge keys will not work",
    );
  }

  // Database role (needs DATABASE_URL; skip when it is already a failure)
  if (databaseUrl) {
    const probe = await (deps.probeDatabaseRole ?? probeDatabaseRole)(databaseUrl);
    if (probe.error) {
      fail(
        "database_role_unverified",
        `Could not connect to DATABASE_URL to verify the database role (${probe.error})`,
      );
    } else {
      if (probe.superuser === true) {
        fail(
          "database_superuser",
          "DATABASE_URL role is a Postgres superuser; use a least-privileged application role (superusers bypass the append-only triggers)",
        );
      }
      if (probe.canSetReplicationRole === true) {
        fail(
          "database_can_set_replication_role",
          "DATABASE_URL role can SET session_replication_role, which disables the append-only triggers; revoke it",
        );
      } else if (probe.canSetReplicationRole === null && probe.superuser !== true) {
        warnings.push(
          "Could not determine whether the database role can SET session_replication_role (probe inconclusive)",
        );
      }
      if (probe.ownsAppendOnlyTables === true) {
        warnings.push(
          "The application database role owns event/forensic_receipt; owners can ALTER TABLE ... DISABLE TRIGGER. Run migrations as a separate owner role",
        );
      }
    }
  }

  return { production, ok: failures.length === 0, failures, warnings };
}

/** Throws ProductionGuardError (listing every problem) when production guards fail. */
export async function assertProductionBoot(
  env: Env = process.env,
  deps: ProductionGuardDeps = {},
): Promise<GuardReport> {
  const report = await evaluateProductionGuards(env, deps);
  if (!report.ok) throw new ProductionGuardError(report.failures);
  return report;
}
