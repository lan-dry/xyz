import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { PoolClient } from "pg";
import {
  hashPassword,
  listMembersInOrg,
  verifyPassword,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";

export const scimRoutes = new Hono();

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  auditor: 2,
  engineer: 3,
  admin: 4,
};

type ScimOrg = { organizationId: string; defaultRole: string };

type PatchOperation = {
  op: string;
  path?: string;
  value?: unknown;
};

function scimBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice(7).trim();
}

async function resolveOrgFromScimToken(token: string): Promise<ScimOrg | null> {
  const pool = getPool();
  const rows = await pool.query<{
    organization_id: string;
    bearer_token_hash: string;
    default_role: string;
    enabled: boolean;
  }>(`SELECT organization_id, bearer_token_hash, default_role, enabled FROM organization_scim`);
  for (const row of rows.rows) {
    if (!row.enabled) {
      continue;
    }
    if (verifyPassword(token, row.bearer_token_hash)) {
      return {
        organizationId: row.organization_id,
        defaultRole: row.default_role,
      };
    }
  }
  return null;
}

async function requireScimOrg(c: {
  req: { header: (name: string) => string | undefined };
}): Promise<ScimOrg | null> {
  const token = scimBearerToken(c.req.header("Authorization"));
  if (!token) {
    return null;
  }
  return resolveOrgFromScimToken(token);
}

function memberToScimUser(m: {
  membership_id: string;
  email: string;
  display_name: string | null;
  status: string;
  role: string;
}) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: m.membership_id,
    userName: m.email,
    name: { formatted: m.display_name ?? m.email },
    active: m.status === "active",
    emails: [{ value: m.email, primary: true }],
    roles: [{ value: m.role, primary: true }],
  };
}

async function loadMembership(
  organizationId: string,
  membershipId: string,
): Promise<{
  membership_id: string;
  email: string;
  display_name: string | null;
  status: string;
  role: string;
  account_id: string;
} | null> {
  const pool = getPool();
  const row = await pool.query<{
    membership_id: string;
    email: string;
    display_name: string | null;
    status: string;
    role: string;
    account_id: string;
  }>(
    `SELECT m.membership_id, a.email, a.display_name, m.status, m.role, m.account_id
     FROM membership m
     JOIN account a ON a.account_id = m.account_id
     WHERE m.organization_id = $1 AND m.membership_id = $2`,
    [organizationId, membershipId],
  );
  return row.rows[0] ?? null;
}

async function syncMembershipRoleFromGroups(
  client: PoolClient,
  organizationId: string,
  membershipId: string,
  fallbackRole: string,
): Promise<void> {
  const groups = await client.query<{ role: string }>(
    `SELECT g.role
     FROM organization_scim_group_member gm
     JOIN organization_scim_group g ON g.scim_group_id = gm.scim_group_id
     WHERE gm.organization_id = $1 AND gm.membership_id = $2`,
    [organizationId, membershipId],
  );
  let role = fallbackRole;
  for (const g of groups.rows) {
    if ((ROLE_RANK[g.role] ?? 0) > (ROLE_RANK[role] ?? 0)) {
      role = g.role;
    }
  }
  await client.query(
    `UPDATE membership SET role = $1 WHERE membership_id = $2 AND organization_id = $3`,
    [role, membershipId, organizationId],
  );
}

function normalizePatchOps(body: {
  Operations?: PatchOperation[];
  operations?: PatchOperation[];
}): PatchOperation[] {
  return body.Operations ?? body.operations ?? [];
}

function parseFilterUserName(filter: string | undefined): string | null {
  if (!filter) {
    return null;
  }
  const match = filter.match(/userName\s+eq\s+"([^"]+)"/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function groupToScimResource(row: {
  scim_group_id: string;
  display_name: string;
  external_id: string | null;
  role: string;
  members: { value: string; display: string }[];
}) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id: row.scim_group_id,
    displayName: row.display_name,
    externalId: row.external_id ?? undefined,
    members: row.members,
    meta: {
      resourceType: "Group",
      salanorRole: row.role,
    },
  };
}

async function loadGroup(organizationId: string, groupId: string) {
  const pool = getPool();
  const group = await pool.query<{
    scim_group_id: string;
    display_name: string;
    external_id: string | null;
    role: string;
  }>(
    `SELECT scim_group_id, display_name, external_id, role
     FROM organization_scim_group
     WHERE organization_id = $1 AND scim_group_id = $2`,
    [organizationId, groupId],
  );
  const g = group.rows[0];
  if (!g) {
    return null;
  }
  const members = await pool.query<{ membership_id: string; email: string }>(
    `SELECT gm.membership_id, a.email
     FROM organization_scim_group_member gm
     JOIN membership m ON m.membership_id = gm.membership_id
     JOIN account a ON a.account_id = m.account_id
     WHERE gm.scim_group_id = $1`,
    [groupId],
  );
  return groupToScimResource({
    ...g,
    members: members.rows.map((m) => ({
      value: m.membership_id,
      display: m.email,
    })),
  });
}

scimRoutes.get("/v2/ServiceProviderConfig", (c) => {
  return c.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false },
    filter: { supported: true, maxResults: 200 },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer Token",
        description: "Organization SCIM bearer token",
      },
    ],
  });
});

scimRoutes.get("/v2/Users", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const filterEmail = parseFilterUserName(c.req.query("filter"));
  const { members } = await listMembersInOrg(getPool(), org.organizationId, {
    limit: 200,
    offset: 0,
  });
  const filtered = filterEmail
    ? members.filter((m) => m.email.toLowerCase() === filterEmail)
    : members;
  return c.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: filtered.length,
    Resources: filtered.map((m) => memberToScimUser(m)),
  });
});

scimRoutes.get("/v2/Users/:id", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const member = await loadMembership(org.organizationId, c.req.param("id"));
  if (!member) {
    return c.json({ detail: "User not found" }, 404);
  }
  return c.json(memberToScimUser(member));
});

scimRoutes.post("/v2/Users", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const body = await c.req.json<{
    userName?: string;
    emails?: { value: string }[];
    name?: { formatted?: string };
    active?: boolean;
  }>();
  const email = (
    body.userName ??
    body.emails?.[0]?.value ??
    ""
  )
    .trim()
    .toLowerCase();
  if (!email) {
    return c.json({ detail: "userName required" }, 400);
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let accountId: string;
    const existing = await client.query<{ account_id: string }>(
      `SELECT account_id FROM account WHERE lower(email) = $1`,
      [email],
    );
    if (existing.rows[0]) {
      accountId = existing.rows[0].account_id;
    } else {
      const ins = await client.query<{ account_id: string }>(
        `INSERT INTO account (email, display_name, password_hash, email_verified_at)
         VALUES ($1, $2, NULL, now()) RETURNING account_id`,
        [email, body.name?.formatted?.trim() || null],
      );
      accountId = ins.rows[0]!.account_id;
    }
    const membership = await client.query<{ membership_id: string }>(
      `INSERT INTO membership (account_id, organization_id, role, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, account_id) DO UPDATE
         SET status = EXCLUDED.status, role = EXCLUDED.role
       RETURNING membership_id`,
      [
        accountId,
        org.organizationId,
        org.defaultRole,
        body.active === false ? "suspended" : "active",
      ],
    );
    await client.query("COMMIT");
    const membershipId = membership.rows[0]!.membership_id;
    const member = await loadMembership(org.organizationId, membershipId);
    return c.json(memberToScimUser(member!), 201);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[id] scim create user", error);
    return c.json({ detail: "Provision failed" }, 500);
  } finally {
    client.release();
  }
});

scimRoutes.patch("/v2/Users/:id", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const membershipId = c.req.param("id");
  const member = await loadMembership(org.organizationId, membershipId);
  if (!member) {
    return c.json({ detail: "User not found" }, 404);
  }
  const body = await c.req.json<{
    Operations?: PatchOperation[];
    operations?: PatchOperation[];
  }>();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const op of normalizePatchOps(body)) {
      const name = op.op.toLowerCase();
      const path = (op.path ?? "").toLowerCase();
      if (name === "replace" || name === "add") {
        if (path === "active" || path === "") {
          const active =
            path === "active"
              ? op.value !== false && op.value !== "False"
              : (op.value as { active?: boolean })?.active !== false;
          await client.query(
            `UPDATE membership SET status = $1 WHERE membership_id = $2`,
            [active ? "active" : "suspended", membershipId],
          );
        }
        if (path === "username" || path === "userName".toLowerCase()) {
          const email = String(op.value).trim().toLowerCase();
          if (email) {
            await client.query(`UPDATE account SET email = $1 WHERE account_id = $2`, [
              email,
              member.account_id,
            ]);
          }
        }
        if (path === "name.formatted" || path === "displayname") {
          const display = String(op.value).trim();
          await client.query(
            `UPDATE account SET display_name = $1 WHERE account_id = $2`,
            [display || null, member.account_id],
          );
        }
        if (path === "roles" || path.startsWith("roles")) {
          const roleValue =
            Array.isArray(op.value) && op.value[0]
              ? String((op.value[0] as { value?: string }).value ?? op.value[0])
              : String(op.value);
          if (roleValue in ROLE_RANK) {
            await client.query(
              `UPDATE membership SET role = $1 WHERE membership_id = $2`,
              [roleValue, membershipId],
            );
          }
        }
      }
      if (name === "remove" && path === "active") {
        await client.query(
          `UPDATE membership SET status = 'suspended' WHERE membership_id = $1`,
          [membershipId],
        );
      }
    }
    await syncMembershipRoleFromGroups(
      client,
      org.organizationId,
      membershipId,
      org.defaultRole,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[id] scim patch user", error);
    return c.json({ detail: "Patch failed" }, 500);
  } finally {
    client.release();
  }
  const updated = await loadMembership(org.organizationId, membershipId);
  return c.json(memberToScimUser(updated!));
});

scimRoutes.get("/v2/Groups", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const pool = getPool();
  const groups = await pool.query<{
    scim_group_id: string;
    display_name: string;
    external_id: string | null;
    role: string;
  }>(
    `SELECT scim_group_id, display_name, external_id, role
     FROM organization_scim_group WHERE organization_id = $1 ORDER BY display_name`,
    [org.organizationId],
  );
  const resources = [];
  for (const g of groups.rows) {
    resources.push(await loadGroup(org.organizationId, g.scim_group_id));
  }
  return c.json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
    totalResults: resources.length,
    Resources: resources.filter(Boolean),
  });
});

scimRoutes.get("/v2/Groups/:id", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const group = await loadGroup(org.organizationId, c.req.param("id"));
  if (!group) {
    return c.json({ detail: "Group not found" }, 404);
  }
  return c.json(group);
});

scimRoutes.post("/v2/Groups", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const body = await c.req.json<{
    displayName?: string;
    externalId?: string;
    members?: { value: string }[];
    meta?: { salanorRole?: string };
  }>();
  const displayName = body.displayName?.trim();
  if (!displayName) {
    return c.json({ detail: "displayName required" }, 400);
  }
  const role =
    body.meta?.salanorRole && body.meta.salanorRole in ROLE_RANK
      ? body.meta.salanorRole
      : org.defaultRole;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query<{ scim_group_id: string }>(
      `INSERT INTO organization_scim_group (organization_id, external_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, external_id) DO UPDATE
         SET display_name = EXCLUDED.display_name, role = EXCLUDED.role
       RETURNING scim_group_id`,
      [org.organizationId, body.externalId?.trim() || null, displayName, role],
    );
    const groupId = ins.rows[0]!.scim_group_id;
    for (const m of body.members ?? []) {
      const membershipId = m.value?.trim();
      if (!membershipId) {
        continue;
      }
      await client.query(
        `INSERT INTO organization_scim_group_member (scim_group_id, membership_id, organization_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [groupId, membershipId, org.organizationId],
      );
      await syncMembershipRoleFromGroups(
        client,
        org.organizationId,
        membershipId,
        org.defaultRole,
      );
    }
    await client.query("COMMIT");
    const group = await loadGroup(org.organizationId, groupId);
    return c.json(group, 201);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[id] scim create group", error);
    return c.json({ detail: "Group provision failed" }, 500);
  } finally {
    client.release();
  }
});

scimRoutes.patch("/v2/Groups/:id", async (c) => {
  const org = await requireScimOrg(c);
  if (!org) {
    return c.json({ detail: "Unauthorized" }, 401);
  }
  const groupId = c.req.param("id");
  const existing = await loadGroup(org.organizationId, groupId);
  if (!existing) {
    return c.json({ detail: "Group not found" }, 404);
  }
  const body = await c.req.json<{
    Operations?: PatchOperation[];
    operations?: PatchOperation[];
  }>();
  const pool = getPool();
  const client = await pool.connect();
  const touchedMemberships = new Set<string>();
  try {
    await client.query("BEGIN");
    for (const op of normalizePatchOps(body)) {
      const name = op.op.toLowerCase();
      const path = (op.path ?? "").toLowerCase();
      if (name === "replace") {
        if (path === "displayname") {
          await client.query(
            `UPDATE organization_scim_group SET display_name = $1 WHERE scim_group_id = $2`,
            [String(op.value).trim(), groupId],
          );
        }
        if (path === "externalid") {
          await client.query(
            `UPDATE organization_scim_group SET external_id = $1 WHERE scim_group_id = $2`,
            [String(op.value).trim(), groupId],
          );
        }
        if (path === "salanorrole" || path === 'meta.salanorrole') {
          const role = String(op.value);
          if (role in ROLE_RANK) {
            await client.query(
              `UPDATE organization_scim_group SET role = $1 WHERE scim_group_id = $2`,
              [role, groupId],
            );
          }
        }
      }
      if (name === "add" && (path === "members" || path.startsWith("members"))) {
        const values = Array.isArray(op.value) ? op.value : [op.value];
        for (const entry of values) {
          const membershipId = String(
            (entry as { value?: string }).value ?? entry,
          ).trim();
          if (!membershipId) {
            continue;
          }
          await client.query(
            `INSERT INTO organization_scim_group_member (scim_group_id, membership_id, organization_id)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [groupId, membershipId, org.organizationId],
          );
          touchedMemberships.add(membershipId);
        }
      }
      if (name === "remove" && path.startsWith("members")) {
        const match = path.match(/members\[value eq "([^"]+)"\]/i);
        const membershipId = match?.[1] ?? String(op.value ?? "").trim();
        if (membershipId) {
          await client.query(
            `DELETE FROM organization_scim_group_member
             WHERE scim_group_id = $1 AND membership_id = $2`,
            [groupId, membershipId],
          );
          touchedMemberships.add(membershipId);
        }
      }
    }
    for (const membershipId of touchedMemberships) {
      await syncMembershipRoleFromGroups(
        client,
        org.organizationId,
        membershipId,
        org.defaultRole,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[id] scim patch group", error);
    return c.json({ detail: "Group patch failed" }, 500);
  } finally {
    client.release();
  }
  const group = await loadGroup(org.organizationId, groupId);
  return c.json(group);
});

export function generateScimBearerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashScimToken(token: string): string {
  return hashPassword(token);
}

export function scimTokenPreview(token: string): string {
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export function stableScimTokenId(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}
