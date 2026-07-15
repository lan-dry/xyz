import { createHash, randomBytes } from "node:crypto";

import type { OrganizationRole } from "@prisma/client";
import nodemailer from "nodemailer";

export const INVITE_TOKEN_BYTES = 32;
export const INVITE_TTL_DAYS = 7;

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(INVITE_TOKEN_BYTES).toString("hex");
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidInviteToken(token: string | null | undefined): token is string {
  if (!token) return false;
  return /^[a-f0-9]{64}$/i.test(token.trim());
}

export function inviteExpiryDate(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function buildInviteAcceptUrl(token: string): string {
  const base = process.env.AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/invite/accept?token=${encodeURIComponent(token)}`;
}

type InviteEligibilityDb = {
  organizationMembership: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
  organizationInvite: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
};

export type InviteCreationBlockReason = "already_member" | "already_invited" | null;

/**
 * Returns a blocker when an invite should not be created for this organization/email.
 */
export async function getInviteCreationBlockReason(
  db: InviteEligibilityDb,
  organizationId: string,
  email: string,
): Promise<InviteCreationBlockReason> {
  const normalizedEmail = normalizeInviteEmail(email);
  const now = new Date();

  const [existingMembership, existingPendingInvite] = await Promise.all([
    db.organizationMembership.findFirst({
      where: {
        organizationId,
        identityLink: {
          OR: [{ primaryEmail: normalizedEmail }, { user: { email: normalizedEmail } }],
        },
      },
      select: { id: true },
    }),
    db.organizationInvite.findFirst({
      where: {
        organizationId,
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    }),
  ]);

  if (existingMembership) {
    return "already_member";
  }
  if (existingPendingInvite) {
    return "already_invited";
  }
  return null;
}

export async function sendOrganizationInviteEmail(input: {
  toEmail: string;
  orgName: string;
  role: OrganizationRole;
  invitedByEmail: string;
  acceptUrl: string;
  expiresAt: Date;
}): Promise<void> {
  const server = process.env.EMAIL_SERVER;
  if (!server?.trim()) {
    throw new Error("EMAIL_SERVER is not configured");
  }

  const from = process.env.EMAIL_FROM?.trim() || "Salanor <no-reply@salanor.local>";
  const transport = nodemailer.createTransport(server);
  const expires = input.expiresAt.toLocaleString();
  const subject = `You're invited to ${input.orgName} on Aegis Console`;

  await transport.sendMail({
    from,
    to: input.toEmail,
    subject,
    text: [
      `You were invited to join "${input.orgName}" on Aegis Console.`,
      `Role: ${input.role}`,
      `Invited by: ${input.invitedByEmail}`,
      "",
      `Accept invite: ${input.acceptUrl}`,
      `This invite expires at ${expires}.`,
    ].join("\n"),
    html: `
      <p>You were invited to join <strong>${input.orgName}</strong> on Aegis Console.</p>
      <p><strong>Role:</strong> ${input.role}<br /><strong>Invited by:</strong> ${input.invitedByEmail}</p>
      <p><a href="${input.acceptUrl}">Accept invite</a></p>
      <p>This invite expires at ${expires}.</p>
    `,
  });
}
