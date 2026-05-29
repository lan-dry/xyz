import { NextResponse } from "next/server";

import { ConsoleForbiddenError, ConsoleUnauthorizedError } from "./roles";
import { requireConsoleContextApi, requireConsoleOrgAccess, type ConsoleContext } from "./session";
import type { OrganizationRole } from "./roles";

export async function withConsoleAuth(
  handler: (ctx: ConsoleContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const ctx = await requireConsoleContextApi();
    return await handler(ctx);
  } catch (err) {
    if (err instanceof ConsoleUnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ConsoleForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

export async function withConsoleOrg(
  organizationId: string,
  minRole: OrganizationRole,
  handler: (ctx: ConsoleContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const ctx = await requireConsoleOrgAccess(organizationId, minRole);
    return await handler(ctx);
  } catch (err) {
    if (err instanceof ConsoleForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
