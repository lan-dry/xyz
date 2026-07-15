import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import {
  resolveSession,
  resolveSessionViaId,
  SALANOR_SESSION_COOKIE,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";

export type ConsoleVariables = {
  consoleSession: ConsoleSession;
};

async function resolveConsoleSession(
  token: string,
): Promise<ConsoleSession | null> {
  const idUrl = process.env.SALANOR_ID_URL;
  if (idUrl) {
    try {
      const remote = await resolveSessionViaId(idUrl, token);
      if (remote) {
        return remote;
      }
    } catch {
      /* Salanor ID unreachable — fall back to local session table (dev/tests). */
    }
  }
  return resolveSession(getPool(), token);
}

export async function requireConsoleSession(
  c: Context<{ Variables: ConsoleVariables }>,
  next: Next,
): Promise<Response | void> {
  const token =
    getCookie(c, SALANOR_SESSION_COOKIE) ??
    getCookie(c, "aegis_session");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await resolveConsoleSession(token);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("consoleSession", session);
  await next();
}
