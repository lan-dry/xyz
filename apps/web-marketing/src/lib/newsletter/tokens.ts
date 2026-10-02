import { randomBytes } from "node:crypto";

/** URL-safe opaque token (32 bytes entropy). */
export function newNewsletterToken(): string {
  return randomBytes(32).toString("base64url");
}
