import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import {
  resolveSession,
  resolveSessionViaId,
  SALANOR_SESSION_COOKIE,
  type ConsoleSession,
} from "@salanor/platform-auth";
import { getPool } from "../db/pool.js";

export type InsuranceVariables = {
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
      /* Salanor ID unreachable — fall back to local session table. */
    }
  }
  try {
    return await resolveSession(getPool(), token);
  } catch {
    return null;
  }
}

export async function requireConsoleSession(
  c: Context<{ Variables: InsuranceVariables }>,
  next: Next,
): Promise<Response | void> {
  const token =
    getCookie(c, SALANOR_SESSION_COOKIE) ?? getCookie(c, "aegis_session");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const session = await resolveConsoleSession(token);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("consoleSession", session);
    await next();
  } catch (err) {
    console.error("[insurance] session middleware", err);
    return c.json({ error: "Session validation failed" }, 503);
  }
}
