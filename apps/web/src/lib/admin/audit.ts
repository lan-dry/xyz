import { prisma } from "@/lib/prisma";

import { ensureIdentityLink } from "../console/identity";

export type AdminAuditAction = "admin.user.suspended" | "admin.user.unsuspended";

export async function appendAdminAudit(input: {
  actorUserId: string;
  actorEmail: string;
  action: AdminAuditAction;
  targetUserId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const identity = await ensureIdentityLink(input.actorUserId, input.actorEmail);
  await prisma.consoleAuditLog.create({
    data: {
      organizationId: null,
      actorIdentityId: identity.id,
      action: input.action,
      targetType: "user",
      targetId: input.targetUserId,
      metadata: {
        surface: "admin",
        actorEmail: input.actorEmail,
        ...input.metadata,
      },
    },
  });
}
