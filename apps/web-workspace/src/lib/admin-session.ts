import type { SessionInfo } from "./stoa-client";

export function adminCanWrite(session: SessionInfo | null): boolean {
  return session?.adminConsole?.canWrite === true;
}

export function siteManagerOnly(session: SessionInfo | null): boolean {
  return session?.adminConsole?.siteManagerOnly === true;
}
