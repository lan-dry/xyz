/**
 * Shared logic for `pnpm pilot:wipe-tenant` and `pnpm demo:fresh`.
 *
 * The wipe itself lives in Postgres: `platform_wipe_tenant(slug, execute, actor)` (migration 020),
 * a SECURITY DEFINER function with owner-only EXECUTE. This module only
 *   1. decides whether the operator has authorised a REAL wipe (--confirm <slug> AND
 *      AEGIS_ALLOW_TENANT_WIPE=1), and
 *   2. calls the function over the OWNER connection (MIGRATION_DATABASE_URL), never the app role.
 *
 * It does not set session_replication_role and never touches append-only triggers itself.
 */
import { hostname, userInfo } from "node:os";
import pg from "pg";

export const ALLOW_ENV = "AEGIS_ALLOW_TENANT_WIPE";

/** Same rules as @salanor/db-url (inlined so compiled Railway CLIs need no TS package resolve). */
function normalizePostgresDatabaseUrl(raw: string): string {
  let url = raw.trim();
  url = url.replace(/@localhost([:/])/gi, "@127.0.0.1$1");
  if (/([?&])sslmode=(require|prefer|verify-ca)(&|$)/i.test(url)) {
    url = url.replace(
      /([?&])sslmode=(require|prefer|verify-ca)/gi,
      "$1sslmode=verify-full",
    );
  }
  return url;
}

export class WipeRefusal extends Error {
  constructor(
    readonly code:
      | "missing_slug"
      | "confirm_mismatch"
      | "env_not_set"
      | "no_owner_connection"
      | "not_wipeable"
      | "not_owner_role"
      | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "WipeRefusal";
  }
}

export type WipeMode = "dry_run" | "execute";

/**
 * Decide what the operator asked for. Pure (no I/O) so it is unit-testable.
 *  - no --confirm            -> dry run (never deletes)
 *  - --confirm <not slug>    -> refused
 *  - --confirm <slug>, env unset -> refused
 *  - --confirm <slug> + AEGIS_ALLOW_TENANT_WIPE=1 -> execute
 */
export function decideWipeMode(input: {
  slug: string | undefined;
  confirm: string | undefined;
  env: Record<string, string | undefined>;
}): WipeMode {
  const slug = input.slug?.trim();
  if (!slug) throw new WipeRefusal("missing_slug", "--slug <slug> is required.");
  if (input.confirm === undefined) return "dry_run";
  if (input.confirm.trim() !== slug) {
    throw new WipeRefusal(
      "confirm_mismatch",
      `--confirm must repeat the slug exactly ("${slug}"). Nothing was deleted.`,
    );
  }
  if (input.env[ALLOW_ENV]?.trim() !== "1") {
    throw new WipeRefusal(
      "env_not_set",
      `A real wipe also needs ${ALLOW_ENV}=1 in the environment. Nothing was deleted.`,
    );
  }
  return "execute";
}

export type WipeReport = {
  dry_run: boolean;
  organization_id: string;
  slug: string;
  is_demo: boolean;
  is_test: boolean;
  row_counts: Record<string, number>;
  accounts_kept_other_tenants: number;
  audit_id?: string;
};

export function defaultActor(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.AEGIS_WIPE_ACTOR?.trim();
  let who = "unknown";
  try {
    who = `${userInfo().username}@${hostname()}`;
  } catch {
    /* keep unknown */
  }
  return explicit ? `${explicit} (${who})` : `cli:${who}`;
}

/** The owner connection string. DATABASE_URL (the app role) is deliberately NOT a fallback. */
export function ownerConnectionString(env: Record<string, string | undefined> = process.env): string {
  const url = env.MIGRATION_DATABASE_URL?.trim();
  if (!url) {
    throw new WipeRefusal(
      "no_owner_connection",
      "MIGRATION_DATABASE_URL (the schema OWNER role) is required. The runtime DATABASE_URL (app role) cannot call the wipe function by design.",
    );
  }
  return normalizePostgresDatabaseUrl(url);
}

/** Run the wipe function. `mode` must come from decideWipeMode(). */
export async function callWipeFunction(opts: {
  connectionString: string;
  slug: string;
  mode: WipeMode;
  actor: string;
}): Promise<WipeReport> {
  const client = new pg.Client({ connectionString: opts.connectionString });
  await client.connect();
  try {
    const priv = await client.query<{ ok: boolean | null }>(
      `SELECT has_function_privilege(current_user, 'platform_wipe_tenant(text,boolean,text)', 'EXECUTE') AS ok`,
    );
    if (priv.rows[0]?.ok !== true) {
      throw new WipeRefusal(
        "not_owner_role",
        "This connection may not call platform_wipe_tenant (it is owner-only). Use the schema owner via MIGRATION_DATABASE_URL.",
      );
    }
    await client.query("BEGIN");
    try {
      const res = await client.query<{ result: WipeReport }>(
        `SELECT platform_wipe_tenant($1, $2, $3) AS result`,
        [opts.slug, opts.mode === "execute", opts.actor],
      );
      await client.query("COMMIT");
      return res.rows[0]!.result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("tenant_wipe_refused")) {
        throw new WipeRefusal("not_wipeable", message.replace(/^tenant_wipe_refused:\s*/, ""));
      }
      if (/^tenant_wipe: no organisation/.test(message)) {
        throw new WipeRefusal("not_found", message.replace(/^tenant_wipe:\s*/, ""));
      }
      throw err;
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** One call: authorise, connect as owner, dry-run or wipe. */
export async function runTenantWipe(opts: {
  slug: string | undefined;
  confirm: string | undefined;
  env?: Record<string, string | undefined>;
  actor?: string;
}): Promise<WipeReport> {
  const env = opts.env ?? process.env;
  const mode = decideWipeMode({ slug: opts.slug, confirm: opts.confirm, env });
  const connectionString = ownerConnectionString(env);
  return callWipeFunction({
    connectionString,
    slug: opts.slug!.trim(),
    mode,
    actor: opts.actor ?? defaultActor(env),
  });
}

export function formatReport(report: WipeReport): string {
  const entries = Object.entries(report.row_counts).sort(([a], [b]) => a.localeCompare(b));
  const width = Math.max(...entries.map(([k]) => k.length), 5);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const lines = [
    `${report.dry_run ? "DRY RUN (nothing deleted)" : "WIPED"}: ${report.slug}  (${report.organization_id})`,
    `flags: is_demo=${report.is_demo} is_test=${report.is_test}`,
    "",
    `  ${"table".padEnd(width)}  rows${report.dry_run ? "" : " removed"}`,
    ...entries.map(([k, n]) => `  ${k.padEnd(width)}  ${n}`),
    `  ${"-".repeat(width)}  ----`,
    `  ${"TOTAL".padEnd(width)}  ${total}`,
    "",
    `accounts kept (also members of another tenant): ${report.accounts_kept_other_tenants}`,
  ];
  if (report.audit_id) lines.push(`platform audit record: platform_tenant_wipe_audit.wipe_id = ${report.audit_id}`);
  return lines.join("\n");
}
