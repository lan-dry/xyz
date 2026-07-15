import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "auth.sign_in"
  | "auth.totp_setup_started"
  | "auth.totp_enabled"
  | "auth.totp_disabled"
  | "org_created"
  | "role_changed"
  | "api_key_created"
  | "api_key_revoked"
  | "invite_created"
  | "invite_revoked"
  | "invite_accepted"
  | "member_removed"
  | "org_switched"
  | "billing.checkout_session_created"
  | "billing.portal_session_created";

export async function appendConsoleAudit(input: {
  organizationId?: string | null;
  actorIdentityId: string;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}): Promise<void> {
  await prisma.consoleAuditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorIdentityId: input.actorIdentityId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
