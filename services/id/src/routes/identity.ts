import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  acceptInvitation,
  acceptInvitationWithNewAccount,
  accountExistsForEmail,
  createOrganizationInvitation,
  createOrganizationForAccount,
  createSession,
  generateInviteToken,
  hashPassword,
  InviteError,
  listMembersInOrg,
  listOrganizationsForAccount,
  listPendingInvitations,
  previewInvitation,
  verifyPassword,
  endImpersonation,
  ImpersonationError,
  resolveSession,
  auditConsoleEvent,
  revokeInvitation,
  updateMemberRole,
  MemberRoleError,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  switchSessionOrganization,
  RegisterError,
  writeAuditEvent,
  getAccountPlatformRole,
  type ConsoleSession,
  type OrgRole,
} from "@salanor/platform-auth";
import { sendInviteEmail } from "../email/send-invite.js";
import { getPool } from "../db/pool.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";

function serializeUser(session: ConsoleSession) {
  return {
    user_id: session.userId,
    organization_id: session.organizationId,
    email: session.email,
    display_name: session.displayName,
    role: session.role,
  };
}

async function requireSession(
  c: Parameters<typeof getCookie>[0],
): Promise<ConsoleSession | null> {
  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!token) {
    return null;
  }
  return resolveSession(getPool(), token);
}

function requireAdmin(session: ConsoleSession, organizationId: string): boolean {
  return (
    session.organizationId === organizationId && session.role === "admin"
  );
}

export const identityRoutes = new Hono();

identityRoutes.post("/orgs/switch", async (c) => {
  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: { organization_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.organization_id) {
    return c.json({ error: "organization_id required" }, 422);
  }

  const pool = getPool();
  const prior = await resolveSession(pool, token);
  const session = await switchSessionOrganization(pool, token, body.organization_id);
  if (!session) {
    return c.json({ error: "Organization not available for this account" }, 403);
  }

  if (prior && prior.organizationId !== session.organizationId) {
    await auditConsoleEvent(pool, {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
    }, {
      action: "auth.org.switched",
      resourceType: "organization",
      resourceId: session.organizationId,
      metadata: { from_organization_id: prior.organizationId },
    });
  }

  const organizations = await listOrganizationsForAccount(pool, session.accountId);
  const organization = organizations.find(
    (o) => o.organization_id === session.organizationId,
  );
  if (!organization) {
    return c.json({ error: "Organization not found" }, 500);
  }

  return c.json({
    user: serializeUser(session),
    organization,
    organizations,
  });
});

identityRoutes.post("/orgs/create", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { organization_name?: string; organization_slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.organization_name?.trim()) {
    return c.json({ error: "organization_name required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const created = await createOrganizationForAccount(client, session.accountId, {
      organizationName: body.organization_name,
      organizationSlug: body.organization_slug,
    });

    await auditConsoleEvent(
      client,
      {
        organizationId: created.organization_id,
        membershipId: created.membership_id,
        email: session.email,
      },
      {
        action: "organization.created",
        resourceType: "organization",
        resourceId: created.organization_id,
        metadata: { name: body.organization_name.trim() },
      },
    );

    const switched = await switchSessionOrganization(
      getPool(),
      getCookie(c, SALANOR_SESSION_COOKIE)!,
      created.organization_id,
    );
    if (!switched) {
      return c.json({ error: "Organization created but failed to switch" }, 500);
    }

    return c.json(await buildMePayload(switched), 201);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return c.json({ error: "Organization slug already taken" }, 409);
    }
    if (err instanceof RegisterError) {
      return c.json({ error: err.message, code: err.code }, 422);
    }
    console.error("[id] create org", err);
    return c.json({ error: "Failed to create organization" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.get("/orgs/:orgId/members", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireAdmin(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 25));
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const offset = (page - 1) * limit;
  const { members, total } = await listMembersInOrg(getPool(), orgId, {
    limit,
    offset,
  });
  return c.json({ members, total, page, limit });
});

identityRoutes.patch("/orgs/:orgId/members/:membershipId", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  const membershipId = c.req.param("membershipId");
  if (!requireAdmin(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { role?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const role = body.role as OrgRole | undefined;
  if (!role) {
    return c.json({ error: "role required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const updated = await updateMemberRole(client, {
      organizationId: orgId,
      membershipId,
      role,
      actorMembershipId: session.userId,
      actorAccountId: session.accountId,
    });
    return c.json({
      member: {
        membership_id: updated.membership_id,
        email: updated.email,
        display_name: updated.display_name,
        role: updated.role,
        status: updated.status,
      },
    });
  } catch (err) {
    if (err instanceof MemberRoleError) {
      return c.json({ error: err.message }, 422);
    }
    throw err;
  } finally {
    client.release();
  }
});

identityRoutes.get("/orgs/:orgId/invitations", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireAdmin(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const invitations = await listPendingInvitations(getPool(), orgId);
  return c.json({ invitations });
});

identityRoutes.post("/orgs/:orgId/invitations", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireAdmin(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { email?: string; role?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim();
  const role = (body.role ?? "engineer") as OrgRole;
  const allowed: OrgRole[] = ["admin", "engineer", "auditor", "viewer"];
  if (!email) {
    return c.json({ error: "email required" }, 422);
  }
  if (!allowed.includes(role)) {
    return c.json({ error: "invalid role" }, 422);
  }

  const orgRow = await getPool().query<{ name: string; slug: string }>(
    `SELECT name, slug FROM organization WHERE organization_id = $1`,
    [orgId],
  );
  const org = orgRow.rows[0];
  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const token = generateInviteToken();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const created = await createOrganizationInvitation(client, {
      organizationId: orgId,
      email,
      role,
      invitedByMembershipId: session.userId,
      token,
    });

    await writeAuditEvent(client, {
      organizationId: orgId,
      membershipId: session.userId,
      action: "invitation.created",
      resourceType: "invitation",
      resourceId: created.invitation_id,
      metadata: { email, role },
    });
    await client.query("COMMIT");

    const inviteUrl = `${consoleOrigin}/invite?token=${encodeURIComponent(token)}`;
    await sendInviteEmail({
      to: email,
      inviteUrl,
      organizationName: org.name,
      role,
      invitedByEmail: session.email,
    });

    return c.json({
      invitation_id: created.invitation_id,
      email,
      role,
      expires_at: created.expires_at.toISOString(),
      invite_url: inviteUrl,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof InviteError) {
      return c.json({ error: err.message, code: err.code }, 409);
    }
    console.error("[id] create invitation", err);
    return c.json({ error: "Failed to create invitation" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.delete("/invitations/:invitationId", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const invitationId = c.req.param("invitationId");
  const revoked = await revokeInvitation(
    getPool(),
    session.organizationId,
    invitationId,
  );
  if (!revoked) {
    return c.json({ error: "Not found" }, 404);
  }
  await writeAuditEvent(getPool(), {
    organizationId: session.organizationId,
    membershipId: session.userId,
    action: "invitation.revoked",
    resourceType: "invitation",
    resourceId: invitationId,
  });
  return c.json({ ok: true });
});

identityRoutes.get("/invitations/preview", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: "token required" }, 422);
  }
  const preview = await previewInvitation(getPool(), token);
  if (!preview) {
    return c.json({ error: "Invitation not found or expired" }, 404);
  }
  const has_account = await accountExistsForEmail(getPool(), preview.email);
  return c.json({ invitation: preview, has_account });
});

identityRoutes.post("/invitations/signup-accept", async (c) => {
  let body: { token?: string; display_name?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.token || !body.password) {
    return c.json({ error: "token and password required" }, 422);
  }

  const preview = await previewInvitation(getPool(), body.token);
  if (!preview) {
    return c.json({ error: "Invitation not found or expired" }, 404);
  }

  const { authenticateDevUser, hashPassword } = await import("@salanor/platform-auth");
  const passwordHash = hashPassword(body.password);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const created = await acceptInvitationWithNewAccount(
      client,
      body.token,
      body.display_name?.trim() || null,
      passwordHash,
    );
    await client.query("COMMIT");

    const auth = await authenticateDevUser(client, preview.email, body.password);
    if (!auth) {
      return c.json(
        { error: "Account created but sign-in failed.", code: "signin_failed" },
        401,
      );
    }

    const { token, session } = await createSession(
      client,
      created.accountId,
      created.organizationId,
    );
    setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    return c.json(await buildMePayload(session));
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof InviteError) {
      const status =
        err.code === "account_exists" ? 409 : err.code === "email_mismatch" ? 403 : 409;
      return c.json({ error: err.message, code: err.code }, status);
    }
    console.error("[id] signup-accept", err);
    return c.json({ error: "Failed to create account" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.post("/invitations/accept", async (c) => {
  const cookieToken = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!cookieToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const session = await resolveSession(getPool(), cookieToken);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.token) {
    return c.json({ error: "token required" }, 422);
  }

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const accepted = await acceptInvitation(client, body.token, session.accountId);
    await client.query("COMMIT");

    const switched = await switchSessionOrganization(
      getPool(),
      cookieToken,
      accepted.organizationId,
    );
    if (!switched) {
      return c.json({ error: "Failed to activate organization" }, 500);
    }
    return c.json(await buildMePayload(switched));
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof InviteError) {
      const status = err.code === "email_mismatch" ? 403 : 409;
      return c.json({ error: err.message, code: err.code }, status);
    }
    console.error("[id] accept invitation", err);
    return c.json({ error: "Failed to accept invitation" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.patch("/account/profile", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: { display_name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  await getPool().query(
    `UPDATE account SET display_name = $1, updated_at = now() WHERE account_id = $2`,
    [body.display_name?.trim() || null, session.accountId],
  );
  const updated = await resolveSession(getPool(), getCookie(c, SALANOR_SESSION_COOKIE)!);
  if (!updated) {
    return c.json({ error: "Session expired" }, 401);
  }
  return c.json(await buildMePayload(updated));
});

identityRoutes.post("/account/password", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let body: { current_password?: string; new_password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  if (!body.current_password || !body.new_password) {
    return c.json({ error: "current_password and new_password required" }, 422);
  }
  if (body.new_password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 422);
  }

  const row = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM account WHERE account_id = $1`,
    [session.accountId],
  );
  const hash = row.rows[0]?.password_hash;
  if (!hash || !verifyPassword(body.current_password, hash)) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const { setAccountPassword } = await import("@salanor/platform-auth");
  const pool = getPool();
  await setAccountPassword(pool, session.accountId, body.new_password);
  await auditConsoleEvent(
    pool,
    {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
    },
    {
      action: "auth.password.changed",
      resourceType: "account",
      resourceId: session.accountId,
    },
  );
  return c.json({ ok: true });
});

identityRoutes.post("/auth/impersonate/end", async (c) => {
  const token = getCookie(c, SALANOR_SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  try {
    const result = await endImpersonation(getPool(), token);
    setCookie(c, SALANOR_SESSION_COOKIE, result.token, sessionCookieOptions(60 * 60 * 24 * 7));
    return c.json(await buildMePayload(result.session));
  } catch (err) {
    if (err instanceof ImpersonationError) {
      return c.json({ error: err.message }, 422);
    }
    throw err;
  }
});

identityRoutes.get("/account/memberships", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgs = await listOrganizationsForAccount(getPool(), session.accountId);
  const memberships = await getPool().query<{
    membership_id: string;
    organization_id: string;
    role: string;
    joined_at: Date;
    name: string;
    slug: string;
  }>(
    `SELECT m.membership_id, m.organization_id, m.role, m.joined_at, o.name, o.slug
     FROM membership m
     JOIN organization o ON o.organization_id = m.organization_id
     WHERE m.account_id = $1 AND m.status = 'active'
     ORDER BY o.name`,
    [session.accountId],
  );
  return c.json({
    memberships: memberships.rows.map((m) => ({
      membership_id: m.membership_id,
      organization_id: m.organization_id,
      organization_name: m.name,
      organization_slug: m.slug,
      role: m.role,
      joined_at: m.joined_at.toISOString(),
      is_active: m.organization_id === session.organizationId,
    })),
    organizations: orgs,
  });
});

export async function buildMePayload(session: ConsoleSession) {
  const organizations = await listOrganizationsForAccount(
    getPool(),
    session.accountId,
  );
  const organization = organizations.find(
    (o) => o.organization_id === session.organizationId,
  );
  if (!organization) {
    throw new Error("Organization not found for session");
  }
  const staffRow = await getPool().query<{ email_verified_at: Date | null }>(
    `SELECT email_verified_at FROM account WHERE account_id = $1`,
    [session.accountId],
  );
  const platformRole = await getAccountPlatformRole(getPool(), session.accountId);

  return {
    account: {
      account_id: session.accountId,
      email: session.email,
      display_name: session.displayName,
      platform_role: platformRole,
      /** True when account has any platform role (Ops access). */
      platform_staff: platformRole != null,
      email_verified: staffRow.rows[0]?.email_verified_at != null,
    },
    user: serializeUser(session),
    organization,
    organizations,
    impersonation: session.impersonation
      ? {
          active: true,
          organization_name: organization.name,
          organization_slug: organization.slug,
          actor_account_id: session.impersonation.impersonatorAccountId,
          actor_email: session.impersonation.impersonatorEmail,
          actor_platform_role: session.impersonation.impersonatorPlatformRole,
          started_at: session.impersonation.startedAt,
          effective_role: session.role,
        }
      : null,
  };
}
