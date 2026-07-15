import type { Prisma } from "@prisma/client";

export function adminUserAuditWhere(userId: string): Prisma.ConsoleAuditLogWhereInput {
  return {
    targetType: "user",
    targetId: userId,
  };
}

export function adminAuditActorEmail(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const actorEmail = (metadata as { actorEmail?: unknown }).actorEmail;
  return typeof actorEmail === "string" ? actorEmail : null;
}
