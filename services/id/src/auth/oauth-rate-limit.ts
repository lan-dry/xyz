import type { Context } from "hono";
import {
  checkRateLimit,
  getClientIp,
  oauthRateLimitKey,
  rateLimitResponse,
  readRateLimitEnv,
} from "@salanor/platform-auth";

export function enforceOAuthRateLimit(c: Context): Response | null {
  const ip = getClientIp(c.req.raw.headers);
  const limit = readRateLimitEnv("LOGIN_RATE_LIMIT", 20);
  const windowMs = readRateLimitEnv("LOGIN_RATE_WINDOW_MS", 900_000);
  const rl = checkRateLimit(oauthRateLimitKey(ip), { limit, windowMs });
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec);
  }
  return null;
}
