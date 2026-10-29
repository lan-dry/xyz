import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  acceptInvitation,
  acceptInvitationWithNewAccount,
  accountExistsForEmail,
  ACCOUNT_BOOTSTRAP_COOKIE,
  createOrganizationInvitation,
  createOrganizationForAccount,
  createSession,
  generateInviteToken,
  hashPassword,
  InviteError,
  PlanLimitError,
  listMembersInOrg,
  listOrganizationsForAccount,
  listPendingInvitations,
  previewInvitation,
  verifyPassword,
  verifyAccountBootstrapToken,
  endImpersonation,
  ImpersonationError,
  resolveSession,
  auditConsoleEvent,
  revokeInvitation,
  rotatePendingInvitation,
  updateMemberRole,
  setMemberStatus,
  MemberRoleError,
  MemberStatusError,
  SALANOR_SESSION_COOKIE,
  sessionCookieOptions,
  switchSessionOrganization,
  RegisterError,
  registerSelfServeOrganization,
  createEmailVerificationToken,
  createPasswordResetToken,
  resetPasswordWithToken,
  resolveAuditContextForAccount,
  setAccountPassword,
  verifyEmailWithToken,
  isEmailVerified,
  completeOrganizationOnboarding,
  OnboardingError,
  slugifyOrganizationName,
  updateOrganizationProfile,
  OrganizationProfileError,
  recordAccountLoginEvent,
  listAccountLoginEvents,
  describeUserAgent,
  getClientIp,
  writeAuditEvent,
  getAccountPlatformRole,
  canReadOrgConsole,
  canWriteOrgConsole,
  type ConsoleSession,
  type OrgRole,
} from "@salanor/platform-auth";
import { sendInviteEmail } from "../email/send-invite.js";
import { EmailDeliveryError } from "../email/email-delivery.js";
import { sendEmailVerificationEmail } from "../email/send-email-verification.js";
import { sendPasswordResetEmail } from "../email/send-password-reset.js";
import {
  resolveOrgTransactionalFrom,
  resolveOrgTransactionalFromForAccount,
} from "../email/org-transactional-from.js";
import { getPool } from "../db/pool.js";
import { generateScimBearerToken, hashScimToken } from "./scim.js";

const consoleOrigin = process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";

/** Invite links: Stoa workspace when configured, else Aegis Console. */
function inviteAcceptOrigin(): string {
  return process.env.STOA_WORKSPACE_ORIGIN?.replace(/\/$/, "") ?? consoleOrigin;
}

function passwordResetOrigin(): string {
  return inviteAcceptOrigin();
}

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

function requireOrgRead(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  return canReadOrgConsole(session, organizationId);
}

function requireOrgWrite(
  session: ConsoleSession,
  organizationId: string,
): boolean {
  return canWriteOrgConsole(session, organizationId);
}

export const identityRoutes = new Hono();

identityRoutes.post("/auth/register", async (c) => {
  let body: {
    email?: string;
    password?: string;
    organization_name?: string;
    organization_slug?: string;
    display_name?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const email = body.email?.trim();
  const password = body.password;
  const organizationName = body.organization_name?.trim();
  if (!email || !password || !organizationName) {
    return c.json({ error: "email, password, and organization_name required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const result = await registerSelfServeOrganization(client, {
      email,
      password,
      organizationName,
      organizationSlug: body.organization_slug,
      displayName: body.display_name,
    });

    const verifyToken = await createEmailVerificationToken(client, result.account_id);
    const verifyUrl = `${consoleOrigin}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    await sendEmailVerificationEmail({ to: email.toLowerCase(), verifyUrl });

    return c.json({
      ok: true,
      verify_required: true,
      email: email.toLowerCase(),
      organization_id: result.organization_id,
      organization_slug: result.organization_slug,
    });
  } catch (err) {
    if (err instanceof RegisterError) {
      const status = err.code === "email_taken" ? 409 : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    if (err instanceof EmailDeliveryError) {
      return c.json(
        {
          error:
            "We could not send a verification email. Try again later or contact support.",
          code: err.code,
        },
        err.code === "email_not_configured" ? 503 : 502,
      );
    }
    console.error("[id] register", err);
    return c.json({ error: "Registration failed" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.post("/auth/resend-verification", async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return c.json({ error: "email required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const pending = await client.query<{ account_id: string }>(
      `SELECT account_id FROM account
       WHERE lower(email) = $1 AND active = true AND email_verified_at IS NULL`,
      [email],
    );
    const accountId = pending.rows[0]?.account_id;
    if (accountId) {
      const verifyToken = await createEmailVerificationToken(client, accountId);
      const verifyUrl = `${consoleOrigin}/verify-email?token=${encodeURIComponent(verifyToken)}`;
      await sendEmailVerificationEmail({ to: email, verifyUrl });
    }
    return c.json({
      ok: true,
      message:
        "If your account is pending verification, we sent a new link to that address.",
    });
  } catch (err) {
    if (err instanceof EmailDeliveryError) {
      return c.json(
        {
          error: "Verification email could not be sent. Try again later.",
          code: err.code,
        },
        503,
      );
    }
    console.error("[id] resend-verification", err);
    return c.json({ error: "Could not resend verification email" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.post("/auth/onboarding/complete", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (session.role !== "admin") {
    return c.json({ error: "Only organization admins can complete onboarding" }, 403);
  }

  let body: { organization_name?: string; organization_slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const organizationName = body.organization_name?.trim();
  if (!organizationName) {
    return c.json({ error: "organization_name required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const org = await completeOrganizationOnboarding(client, {
      organizationId: session.organizationId,
      membershipId: session.userId,
      organizationName,
      organizationSlug: body.organization_slug,
    });
    return c.json({
      ok: true,
      organization: {
        organization_id: org.organization_id,
        name: org.name,
        slug: org.slug,
        needs_onboarding: false,
      },
    });
  } catch (err) {
    if (err instanceof OnboardingError) {
      const status = err.code === "slug_taken" ? 409 : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    console.error("[id] onboarding complete", err);
    return c.json({ error: "Failed to complete onboarding" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.get("/auth/onboarding/slug-preview", async (c) => {
  const name = c.req.query("name")?.trim() ?? "";
  if (!name) {
    return c.json({ slug: "" });
  }
  return c.json({ slug: slugifyOrganizationName(name) });
});

identityRoutes.post("/auth/verify-email", async (c) => {
  let body: { token?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const token = body.token?.trim();
  if (!token) {
    return c.json({ error: "token required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const verified = await verifyEmailWithToken(client, token);
    if (!verified) {
      return c.json({ error: "Invalid or expired verification link" }, 422);
    }

    const { token: sessionToken, session } = await createSession(
      client,
      verified.accountId,
      verified.organizationId,
    );
    setCookie(c, SALANOR_SESSION_COOKIE, sessionToken, sessionCookieOptions(60 * 60 * 24 * 7));
    return c.json(await buildMePayload(session));
  } finally {
    client.release();
  }
});

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

identityRoutes.patch("/orgs/:orgId", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { organization_name?: string; organization_slug?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const client = await getPool().connect();
  try {
    const updated = await updateOrganizationProfile(client, {
      organizationId: orgId,
      membershipId: session.userId,
      name: body.organization_name,
      slug: body.organization_slug,
    });
    return c.json({
      ok: true,
      organization: {
        organization_id: updated.organization_id,
        name: updated.name,
        slug: updated.slug,
      },
      slug_changed: updated.slug_changed,
      message: updated.slug_changed
        ? "Organization updated. Agent DIDs were rebound to the new URL slug."
        : "Organization updated.",
    });
  } catch (err) {
    if (err instanceof OrganizationProfileError) {
      const status =
        err.code === "slug_taken" ? 409 : err.code === "not_found" ? 404 : 422;
      return c.json({ error: err.message, code: err.code }, status);
    }
    console.error("[id] patch org", err);
    return c.json({ error: "Failed to update organization" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.post("/orgs/create", async (c) => {
  let accountId: string | null = null;
  let actorEmail: string | null = null;

  const sessionToken = getCookie(c, SALANOR_SESSION_COOKIE);
  if (sessionToken) {
    const session = await resolveSession(getPool(), sessionToken);
    if (session) {
      accountId = session.accountId;
      actorEmail = session.email;
    }
  }

  if (!accountId) {
    const bootstrap = getCookie(c, ACCOUNT_BOOTSTRAP_COOKIE);
    if (bootstrap) {
      accountId = verifyAccountBootstrapToken(bootstrap);
    }
  }

  if (!accountId) {
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
    const created = await createOrganizationForAccount(client, accountId, {
      organizationName: body.organization_name,
      organizationSlug: body.organization_slug,
    });

    if (!actorEmail) {
      const acct = await client.query<{ email: string }>(
        `SELECT email FROM account WHERE account_id = $1`,
        [accountId],
      );
      actorEmail = acct.rows[0]?.email ?? "";
    }

    await auditConsoleEvent(
      client,
      {
        organizationId: created.organization_id,
        membershipId: created.membership_id,
        email: actorEmail,
      },
      {
        action: "organization.created",
        resourceType: "organization",
        resourceId: created.organization_id,
        metadata: { name: body.organization_name.trim() },
      },
    );

    const { token, session } = await createSession(
      client,
      accountId,
      created.organization_id,
    );
    setCookie(c, SALANOR_SESSION_COOKIE, token, sessionCookieOptions(60 * 60 * 24 * 7));
    deleteCookie(c, ACCOUNT_BOOTSTRAP_COOKIE, sessionCookieOptions(0));

    return c.json(await buildMePayload(session), 201);
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
  if (!requireOrgRead(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 25));
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const offset = (page - 1) * limit;
  const q = c.req.query("q")?.trim() || undefined;
  const role = c.req.query("role")?.trim() || undefined;
  const status = c.req.query("status")?.trim() || undefined;
  const { members, total } = await listMembersInOrg(getPool(), orgId, {
    limit,
    offset,
    q,
    role,
    status,
  });
  return c.json({ members, total, page, limit, q: q ?? null, role: role ?? null, status: status ?? null });
});

identityRoutes.patch("/orgs/:orgId/members/:membershipId", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  const membershipId = c.req.param("membershipId");
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { role?: string; status?: "active" | "suspended" };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }

  const role = body.role as OrgRole | undefined;
  const status = body.status;
  if (!role && !status) {
    return c.json({ error: "role or status required" }, 422);
  }
  if (role && status) {
    return c.json({ error: "Provide role or status, not both" }, 422);
  }

  const client = await getPool().connect();
  try {
    const updated = status
      ? await setMemberStatus(client, {
          organizationId: orgId,
          membershipId,
          status,
          actorMembershipId: session.userId,
          actorAccountId: session.accountId,
        })
      : await updateMemberRole(client, {
          organizationId: orgId,
          membershipId,
          role: role!,
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
    if (err instanceof MemberRoleError || err instanceof MemberStatusError) {
      return c.json({ error: err.message }, 422);
    }
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code }, err.httpStatus as 402);
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
  if (!requireOrgRead(session, orgId)) {
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
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: { email?: string; role?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim();
  const role = (body.role ?? "viewer") as OrgRole;
  const allowed: OrgRole[] = [
    "owner",
    "admin",
    "approver",
    "engineer",
    "developer",
    "auditor",
    "viewer",
  ];
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

    const inviteUrl = `${inviteAcceptOrigin()}/invite?token=${encodeURIComponent(token)}`;
    let emailDelivered = true;
    try {
      const orgFrom = await resolveOrgTransactionalFrom(orgId);
      await sendInviteEmail({
        to: email,
        inviteUrl,
        organizationName: org.name,
        role,
        invitedByEmail: session.email,
        fromAddress: orgFrom?.from,
        replyTo: orgFrom?.replyTo,
        organizationId: orgId,
      });
      await writeAuditEvent(getPool(), {
        organizationId: orgId,
        membershipId: session.userId,
        action: "invitation.email_sent",
        resourceType: "invitation",
        resourceId: created.invitation_id,
        metadata: { email },
      });
    } catch (emailErr) {
      emailDelivered = false;
      console.error("[id] invitation email failed after create", emailErr);
      await writeAuditEvent(getPool(), {
        organizationId: orgId,
        membershipId: session.userId,
        action: "invitation.email_failed",
        resourceType: "invitation",
        resourceId: created.invitation_id,
        metadata: {
          email,
          code:
            emailErr instanceof EmailDeliveryError
              ? emailErr.code
              : "email_send_failed",
        },
      });
    }

    return c.json({
      invitation_id: created.invitation_id,
      email,
      role,
      expires_at: created.expires_at.toISOString(),
      invite_url: inviteUrl,
      email_delivered: emailDelivered,
      ...(emailDelivered
        ? {}
        : {
            warning:
              "Email could not be sent. Copy the link and share it.",
          }),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof InviteError) {
      const message =
        err.code === "pending_exists"
          ? "A pending invite already exists for this email. Use Resend on that row, or revoke and invite again."
          : err.message;
      return c.json({ error: message, code: err.code }, 409);
    }
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code }, err.httpStatus as 402);
    }
    console.error("[id] create invitation", err);
    return c.json({ error: "Failed to create invitation" }, 500);
  } finally {
    client.release();
  }
});

identityRoutes.post("/orgs/:orgId/invitations/:invitationId/resend", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  const invitationId = c.req.param("invitationId");
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const orgRow = await getPool().query<{ name: string }>(
    `SELECT name FROM organization WHERE organization_id = $1`,
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
    const rotated = await rotatePendingInvitation(client, {
      organizationId: orgId,
      invitationId,
      token,
    });
    if (!rotated) {
      await client.query("ROLLBACK");
      return c.json(
        { error: "Pending invitation not found or expired", code: "not_found" },
        404,
      );
    }

    await writeAuditEvent(client, {
      organizationId: orgId,
      membershipId: session.userId,
      action: "invitation.resent",
      resourceType: "invitation",
      resourceId: invitationId,
      metadata: { email: rotated.email, role: rotated.role },
    });
    await client.query("COMMIT");

    const inviteUrl = `${inviteAcceptOrigin()}/invite?token=${encodeURIComponent(token)}`;
    let emailDelivered = true;
    try {
      const orgFrom = await resolveOrgTransactionalFrom(orgId);
      await sendInviteEmail({
        to: rotated.email,
        inviteUrl,
        organizationName: org.name,
        role: rotated.role,
        invitedByEmail: session.email,
        fromAddress: orgFrom?.from,
        replyTo: orgFrom?.replyTo,
        organizationId: orgId,
      });
      await writeAuditEvent(getPool(), {
        organizationId: orgId,
        membershipId: session.userId,
        action: "invitation.email_sent",
        resourceType: "invitation",
        resourceId: invitationId,
        metadata: { email: rotated.email, resent: true },
      });
    } catch (emailErr) {
      emailDelivered = false;
      console.error("[id] invitation resend email failed", emailErr);
      await writeAuditEvent(getPool(), {
        organizationId: orgId,
        membershipId: session.userId,
        action: "invitation.email_failed",
        resourceType: "invitation",
        resourceId: invitationId,
        metadata: {
          email: rotated.email,
          resent: true,
          code:
            emailErr instanceof EmailDeliveryError
              ? emailErr.code
              : "email_send_failed",
        },
      });
    }

    return c.json({
      invitation_id: rotated.invitation_id,
      email: rotated.email,
      role: rotated.role,
      expires_at: rotated.expires_at.toISOString(),
      invite_url: inviteUrl,
      email_delivered: emailDelivered,
      ...(emailDelivered
        ? {}
        : {
            warning:
              "Link refreshed, but email could not be sent. Copy the link and share it manually.",
          }),
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[id] resend invitation", err);
    return c.json({ error: "Failed to resend invitation" }, 500);
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
  const orgId = session.organizationId;
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const revoked = await revokeInvitation(getPool(), orgId, invitationId);
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

identityRoutes.get("/orgs/:orgId/security", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireOrgRead(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const pool = getPool();
  const org = await pool.query<{ slug: string; name: string }>(
    `SELECT slug, name FROM organization WHERE organization_id = $1`,
    [orgId],
  );
  const row = org.rows[0];
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  const sso = await pool.query<{
    enabled: boolean;
    jit_provision: boolean;
    workos_organization_id: string;
    updated_at: Date;
  }>(
    `SELECT enabled, jit_provision, workos_organization_id, updated_at
     FROM organization_sso WHERE organization_id = $1`,
    [orgId],
  );
  const ssoRow = sso.rows[0];
  const { consoleOrigin, parseEnvWorkosOrgMap, workosEnabled } = await import(
    "../auth/oauth-config.js"
  );
  const envMap = parseEnvWorkosOrgMap();
  const slugKey = row.slug.toLowerCase();
  const envMapWorkosOrgId = envMap[slugKey] ?? null;
  const dbConfigured = Boolean(ssoRow?.enabled && ssoRow.workos_organization_id?.trim());
  const envMapConfigured = Boolean(envMapWorkosOrgId?.trim());
  const loginReady =
    workosEnabled() && (dbConfigured || envMapConfigured);
  let scimEnabled = false;
  let scimUpdatedAt: string | null = null;
  try {
    const scim = await pool.query<{ enabled: boolean; updated_at: Date }>(
      `SELECT enabled, updated_at FROM organization_scim WHERE organization_id = $1`,
      [orgId],
    );
    scimEnabled = scim.rows[0]?.enabled ?? false;
    scimUpdatedAt = scim.rows[0]?.updated_at.toISOString() ?? null;
  } catch {
    scimEnabled = false;
  }
  const apiPublic =
    process.env.STOA_API_PUBLIC_URL?.replace(/\/$/, "") ??
    process.env.SALANOR_ID_PUBLIC_URL?.replace(/\/$/, "") ??
    process.env.SALANOR_ID_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:8094";
  const idPathPrefix =
    process.env.STOA_ID_API_PREFIX?.replace(/\/$/, "") ?? "/v1/stoa/id";
  const stoaOrigin =
    process.env.STOA_WORKSPACE_ORIGIN?.replace(/\/$/, "") ??
    "http://localhost:3004";
  const consoleReturn = `${consoleOrigin().replace(/\/$/, "")}/aegis`;
  const scimPrefix =
    process.env.STOA_SCIM_PREFIX?.replace(/\/$/, "") ?? "/v1/stoa/scim";
  const workosOrgId =
    ssoRow?.workos_organization_id?.trim() || envMapWorkosOrgId || null;
  const workosOrgIdHint = workosOrgId
    ? workosOrgId.length > 8
      ? `${workosOrgId.slice(0, 4)}…${workosOrgId.slice(-4)}`
      : workosOrgId
    : null;
  let configSource: "organization_sso" | "env_map" | "none" = "none";
  if (dbConfigured) {
    configSource = "organization_sso";
  } else if (envMapConfigured) {
    configSource = "env_map";
  }
  const startQuery = `org=${encodeURIComponent(row.slug)}&return=${encodeURIComponent(consoleReturn)}`;
  return c.json({
    organization: { id: orgId, slug: row.slug, name: row.name },
    sso: {
      available: workosEnabled(),
      configured: loginReady,
      loginReady,
      configSource,
      database: {
        present: Boolean(ssoRow),
        enabled: ssoRow?.enabled ?? false,
        jitProvision: ssoRow?.jit_provision ?? false,
        workosOrganizationIdHint: ssoRow?.workos_organization_id
          ? workosOrgIdHint
          : null,
        updatedAt: ssoRow?.updated_at.toISOString() ?? null,
      },
      envMap: {
        configured: envMapConfigured,
        note: envMapConfigured
          ? `SSO_WORKOS_ORG_MAP includes slug "${row.slug}".`
          : "No entry for this org slug in SSO_WORKOS_ORG_MAP.",
      },
      jitProvision: ssoRow?.jit_provision ?? false,
      workosOrganizationIdHint: workosOrgIdHint,
      startUrl: `${apiPublic}${idPathPrefix}/auth/sso/start?${startQuery}`,
      workspaceStartUrl: `${apiPublic}${idPathPrefix}/auth/sso/start?org=${encodeURIComponent(row.slug)}&return=${encodeURIComponent(stoaOrigin)}`,
    },
    scim: {
      enabled: scimEnabled,
      baseUrl: `${apiPublic}${scimPrefix}`,
      updatedAt: scimUpdatedAt,
    },
  });
});

identityRoutes.patch("/orgs/:orgId/sso", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  let body: {
    enabled?: boolean;
    jit_provision?: boolean;
    workos_organization_id?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const pool = getPool();
  const org = await pool.query<{ slug: string }>(
    `SELECT slug FROM organization WHERE organization_id = $1`,
    [orgId],
  );
  if (!org.rows[0]) {
    return c.json({ error: "Not found" }, 404);
  }
  const { parseEnvWorkosOrgMap, workosEnabled } = await import(
    "../auth/oauth-config.js"
  );
  if (!workosEnabled()) {
    return c.json(
      {
        error:
          "WorkOS is not configured on this deployment (WORKOS_API_KEY and WORKOS_CLIENT_ID).",
      },
      503,
    );
  }
  const existing = await pool.query<{
    enabled: boolean;
    jit_provision: boolean;
    workos_organization_id: string;
  }>(
    `SELECT enabled, jit_provision, workos_organization_id FROM organization_sso WHERE organization_id = $1`,
    [orgId],
  );
  const envFallback =
    parseEnvWorkosOrgMap()[org.rows[0].slug.toLowerCase()] ?? null;
  const workosOrgId =
    body.workos_organization_id?.trim() ||
    existing.rows[0]?.workos_organization_id?.trim() ||
    envFallback?.trim() ||
    "";
  const enabled = body.enabled ?? existing.rows[0]?.enabled ?? false;
  const jitProvision =
    body.jit_provision ?? existing.rows[0]?.jit_provision ?? false;
  const finalWorkosOrgId =
    workosOrgId || existing.rows[0]?.workos_organization_id?.trim() || "";
  if (enabled && !finalWorkosOrgId) {
    return c.json(
      {
        error:
          "workos_organization_id is required to enable SSO (or set SSO_WORKOS_ORG_MAP for this org slug).",
      },
      422,
    );
  }
  if (!finalWorkosOrgId && !existing.rows[0]) {
    return c.json({
      ok: true,
      message: "Provide workos_organization_id before saving SSO settings.",
    });
  }
  await pool.query(
    `INSERT INTO organization_sso (organization_id, workos_organization_id, enabled, jit_provision, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (organization_id) DO UPDATE SET
       workos_organization_id = COALESCE(NULLIF(EXCLUDED.workos_organization_id, ''), organization_sso.workos_organization_id),
       enabled = EXCLUDED.enabled,
       jit_provision = EXCLUDED.jit_provision,
       updated_at = now()`,
    [orgId, finalWorkosOrgId, enabled, jitProvision],
  );
  await writeAuditEvent(pool, {
    organizationId: orgId,
    membershipId: session.userId,
    action: "sso.settings_updated",
    resourceType: "organization",
    resourceId: orgId,
    metadata: {
      enabled,
      jit_provision: jitProvision,
      workos_organization_id_set: Boolean(workosOrgId),
    },
  });
  return c.json({ ok: true });
});

identityRoutes.post("/orgs/:orgId/scim/rotate-token", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const orgId = c.req.param("orgId");
  if (!requireOrgWrite(session, orgId)) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const token = generateScimBearerToken();
  const hash = hashScimToken(token);
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO organization_scim (organization_id, bearer_token_hash, enabled)
       VALUES ($1, $2, true)
       ON CONFLICT (organization_id) DO UPDATE
         SET bearer_token_hash = EXCLUDED.bearer_token_hash,
             enabled = true,
             updated_at = now()`,
      [orgId, hash],
    );
  } catch (error) {
    console.error("[id] scim rotate", error);
    return c.json(
      {
        error:
          "SCIM storage not migrated. Run platform db:migrate (004_organization_scim).",
      },
      503,
    );
  }
  await writeAuditEvent(getPool(), {
    organizationId: orgId,
    membershipId: session.userId,
    action: "scim.token_rotated",
    resourceType: "organization",
    resourceId: orgId,
  });
  return c.json({
    bearer_token: token,
    message: "Copy this token now. It will not be shown again.",
  });
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
  if (body.password.length < 10) {
    return c.json({ error: "Password must be at least 10 characters" }, 422);
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
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code }, err.httpStatus as 402);
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
    if (err instanceof PlanLimitError) {
      return c.json({ error: err.message, code: err.code }, err.httpStatus as 402);
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

identityRoutes.get("/account/login-events", async (c) => {
  const session = await requireSession(c);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const limitRaw = Number(c.req.query("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;
  const events = await listAccountLoginEvents(getPool(), session.accountId, limit);

  return c.json({
    events: events.map((e) => ({
      event_id: e.event_id,
      method: e.method,
      success: e.success,
      failure_reason: e.failure_reason,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      device: describeUserAgent(e.user_agent),
      location: e.geo_location,
      created_at: e.created_at.toISOString(),
    })),
  });
});

identityRoutes.post("/auth/forgot-password", async (c) => {
  let body: { email?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const email = body.email?.trim();
  if (!email) {
    return c.json({ error: "email required" }, 422);
  }

  const client = await getPool().connect();
  try {
    const created = await createPasswordResetToken(client, email);
    if (created) {
      const resetUrl = `${passwordResetOrigin()}/reset-password?token=${encodeURIComponent(created.token)}`;
      const orgFrom = await resolveOrgTransactionalFromForAccount(
        created.accountId,
      );
      try {
        await sendPasswordResetEmail({
          to: email,
          resetUrl,
          fromAddress: orgFrom?.from.from,
          replyTo: orgFrom?.from.replyTo,
          organizationId: orgFrom?.orgId ?? null,
        });
      } catch (emailErr) {
        console.error("[id] password reset email failed", emailErr);
      }
    }
    return c.json({
      ok: true,
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  } finally {
    client.release();
  }
});

identityRoutes.post("/auth/reset-password", async (c) => {
  let body: { token?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 422);
  }
  const token = body.token?.trim();
  const password = body.password;
  if (!token || !password) {
    return c.json({ error: "token and password required" }, 422);
  }
  if (password.length < 10) {
    return c.json({ error: "Password must be at least 10 characters" }, 422);
  }

  const client = await getPool().connect();
  try {
    const accountId = await resetPasswordWithToken(client, token, password);
    if (!accountId) {
      return c.json({ error: "Invalid or expired reset link" }, 422);
    }
    const ctx = await resolveAuditContextForAccount(client, accountId);
    if (ctx) {
      await auditConsoleEvent(
        client,
        {
          organizationId: ctx.organizationId,
          membershipId: ctx.membershipId,
        },
        {
          action: "auth.password.reset",
          resourceType: "account",
          resourceId: accountId,
        },
      );
    }
    return c.json({ ok: true });
  } finally {
    client.release();
  }
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
  if (body.new_password.length < 10) {
    return c.json({ error: "Password must be at least 10 characters" }, 422);
  }

  const row = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM account WHERE account_id = $1`,
    [session.accountId],
  );
  const hash = row.rows[0]?.password_hash;
  if (!hash || !verifyPassword(body.current_password, hash)) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

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

export async function buildAccountBootstrapPayload(accountId: string) {
  const pool = getPool();
  const accountRow = await pool.query<{
    account_id: string;
    email: string;
    display_name: string | null;
    email_verified_at: Date | null;
  }>(
    `SELECT account_id, email, display_name, email_verified_at
     FROM account WHERE account_id = $1 AND active = true`,
    [accountId],
  );
  const account = accountRow.rows[0];
  if (!account) {
    throw new Error("Account not found");
  }
  const platformRole = await getAccountPlatformRole(pool, accountId);
  const organizations = await listOrganizationsForAccount(pool, accountId);

  return {
    code: "no_membership" as const,
    needs_organization: true,
    account: {
      account_id: account.account_id,
      email: account.email,
      display_name: account.display_name,
      platform_role: platformRole,
      platform_staff: platformRole != null,
      email_verified: account.email_verified_at != null,
    },
    organizations,
    user: null,
    organization: null,
    needs_onboarding: false,
    impersonation: null,
  };
}

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
  const staffRow = await getPool().query<{
    email_verified_at: Date | null;
    password_hash: string | null;
  }>(
    `SELECT email_verified_at, password_hash FROM account WHERE account_id = $1`,
    [session.accountId],
  );
  const platformRole = await getAccountPlatformRole(getPool(), session.accountId);

  const needsOnboarding = organization.needs_onboarding === true;

  return {
    account: {
      account_id: session.accountId,
      email: session.email,
      display_name: session.displayName,
      platform_role: platformRole,
      /** True when account has any platform role (Ops access). */
      platform_staff: platformRole != null,
      email_verified: staffRow.rows[0]?.email_verified_at != null,
      has_password: Boolean(staffRow.rows[0]?.password_hash),
    },
    user: serializeUser(session),
    organization,
    organizations,
    needs_onboarding: needsOnboarding,
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
