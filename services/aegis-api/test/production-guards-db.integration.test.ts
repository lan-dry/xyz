/**
 * Real-Postgres check of the production role probe: a plain role is safe, a
 * superuser is flagged, and a role granted SET on session_replication_role is
 * flagged. Skips when the test connection is not a superuser (cannot create roles).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { probeDatabaseRole } from "../src/boot/production-guards.js";

const databaseUrl = process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

const ROLE = "aegis_probe_app_test";
const PASSWORD = "probe_pw_not_secret";

function urlAs(role: string, password: string): string {
  const u = new URL(databaseUrl!);
  u.username = role;
  u.password = password;
  return u.toString();
}

describeIfDb("probeDatabaseRole (real Postgres)", () => {
  let admin: pg.Pool;
  let canCreateRoles = false;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: databaseUrl });
    try {
      const me = await admin.query<{ rolsuper: boolean }>(
        `SELECT rolsuper FROM pg_roles WHERE rolname = current_user`,
      );
      canCreateRoles = me.rows[0]?.rolsuper === true;
      if (!canCreateRoles) return;
      await admin.query(`DROP ROLE IF EXISTS ${ROLE}`);
      await admin.query(
        `CREATE ROLE ${ROLE} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER`,
      );
    } catch {
      canCreateRoles = false;
    }
  });

  afterAll(async () => {
    if (canCreateRoles) {
      await admin.query(`DROP OWNED BY ${ROLE}`).catch(() => undefined);
      await admin.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => undefined);
    }
    await admin.end();
  });

  it("flags a superuser connection", async () => {
    if (!canCreateRoles) return;
    const probe = await probeDatabaseRole(databaseUrl!);
    expect(probe.error).toBeUndefined();
    expect(probe.superuser).toBe(true);
    expect(probe.canSetReplicationRole).toBe(true);
  });

  it("passes a least-privileged role", async () => {
    if (!canCreateRoles) return;
    const probe = await probeDatabaseRole(urlAs(ROLE, PASSWORD));
    expect(probe.error).toBeUndefined();
    expect(probe.role).toBe(ROLE);
    expect(probe.superuser).toBe(false);
    expect(probe.canSetReplicationRole).toBe(false);
  });

  it("flags a non-superuser granted SET on session_replication_role", async () => {
    if (!canCreateRoles) return;
    try {
      await admin.query(
        `GRANT SET ON PARAMETER session_replication_role TO ${ROLE}`,
      );
    } catch {
      return; // Postgres < 15: parameter grants do not exist
    }
    const probe = await probeDatabaseRole(urlAs(ROLE, PASSWORD));
    expect(probe.superuser).toBe(false);
    expect(probe.canSetReplicationRole).toBe(true);
  });

  it("reports an error instead of throwing when the database is unreachable", async () => {
    const probe = await probeDatabaseRole(
      "postgresql://nobody:nothing@127.0.0.1:1/none",
    );
    expect(probe.error).toBeTruthy();
    expect(probe.superuser).toBeNull();
  });
});
