import type pg from "pg";
import { auditConsoleEvent, type ConsoleSession } from "@salanor/platform-auth";

export async function auditFromConsoleSession(
  client: pg.Pool | pg.PoolClient,
  session: ConsoleSession,
  input: {
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await auditConsoleEvent(
    client,
    {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
    },
    input,
  );
}
