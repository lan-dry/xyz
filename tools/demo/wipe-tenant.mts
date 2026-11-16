/**
 * pnpm pilot:wipe-tenant --slug <slug> [--confirm <slug>] [--json] [--allow-missing]
 *
 * DEMO / TEST tenants only. Dry run by default: prints the row count per table.
 * A real wipe needs BOTH `--confirm <slug>` and AEGIS_ALLOW_TENANT_WIPE=1.
 *
 * Connects as the schema OWNER (MIGRATION_DATABASE_URL) and calls the SECURITY DEFINER function
 * platform_wipe_tenant() (migration 020). The runtime app role cannot do this and is not given the
 * power to bypass the append-only triggers. Customer tenants (neither is_demo nor is_test) are refused
 * by the database function itself, regardless of what this script does.
 *
 * Exit codes: 0 ok, 2 refused (guard / flags / unknown tenant), 1 error.
 */
import { loadEnvFile } from "./load-env.mts";
import {
  ALLOW_ENV,
  WipeRefusal,
  formatReport,
  runTenantWipe,
} from "./tenant-wipe-lib.mts";

function parseArgs(argv: string[]): {
  slug?: string;
  confirm?: string;
  json: boolean;
  allowMissing: boolean;
} {
  const out: { slug?: string; confirm?: string; json: boolean; allowMissing: boolean } = {
    json: false,
    allowMissing: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const take = (name: string): string | undefined => {
      if (a === name) return argv[++i];
      if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
      return undefined;
    };
    const slug = take("--slug");
    if (slug !== undefined) out.slug = slug;
    const confirm = take("--confirm");
    if (confirm !== undefined) out.confirm = confirm;
    if (a === "--json") out.json = true;
    if (a === "--allow-missing") out.allowMissing = true;
  }
  return out;
}

async function main(): Promise<void> {
  // Fills variables that are not already set (e.g. MIGRATION_DATABASE_URL). DATABASE_URL is never used
  // (see ownerConnectionString), and an .env file can never authorise a wipe: AEGIS_ALLOW_TENANT_WIPE
  // must be set explicitly in the shell for this run.
  const allow = process.env[ALLOW_ENV];
  loadEnvFile();
  if (allow === undefined) delete process.env[ALLOW_ENV];
  const args = parseArgs(process.argv.slice(2));
  let report;
  try {
    report = await runTenantWipe({ slug: args.slug, confirm: args.confirm });
  } catch (err) {
    // demo:fresh: a tenant that does not exist yet is simply "nothing to wipe".
    if (err instanceof WipeRefusal && err.code === "not_found" && args.allowMissing) {
      console.log(`Nothing to wipe: ${err.message}`);
      return;
    }
    throw err;
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatReport(report));
  if (report.dry_run) {
    console.log(
      `\nTo wipe for real:\n  ${ALLOW_ENV}=1 pnpm pilot:wipe-tenant --slug ${report.slug} --confirm ${report.slug}\n`,
    );
  }
}

main().catch((err) => {
  if (err instanceof WipeRefusal) {
    console.error(`\nREFUSED (${err.code}): ${err.message}\n`);
    process.exit(2);
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
