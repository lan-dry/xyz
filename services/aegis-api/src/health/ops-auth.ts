/**
 * Auth for GET /metrics and GET /v1/ops/status.
 * Accepts OPS_METRICS_TOKEN (preferred) or PLATFORM_BOOTSTRAP_SECRET via
 * Authorization: Bearer <token> or X-Ops-Token: <token>.
 */
import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { isProductionEnv } from "../boot/production-env.js";

function configuredOpsToken(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const primary = env.OPS_METRICS_TOKEN?.trim();
  if (primary) return primary;
  const fallback = env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  return fallback || null;
}

function readPresentedToken(c: Context): string | null {
  const header = c.req.header("Authorization")?.trim() ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token) return token;
  }
  const ops = c.req.header("X-Ops-Token")?.trim();
  return ops || null;
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Hono middleware — 401 when the ops token is missing or wrong. */
export async function requireOpsMetricsAuth(c: Context, next: Next) {
  const expected = configuredOpsToken();
  if (!expected) {
    if (isProductionEnv()) {
      return c.json(
        {
          error: "ops_auth_not_configured",
          message: "Set OPS_METRICS_TOKEN (or PLATFORM_BOOTSTRAP_SECRET) for /metrics.",
        },
        503,
      );
    }
    // Local/dev without a token: refuse anyway so scrapers never see a public surface.
    return c.json(
      {
        error: "unauthorized",
        message: "Set OPS_METRICS_TOKEN or PLATFORM_BOOTSTRAP_SECRET and send Bearer / X-Ops-Token.",
      },
      401,
    );
  }
  const presented = readPresentedToken(c);
  if (!presented || !tokensEqual(presented, expected)) {
    return c.json({ error: "unauthorized", message: "Valid ops token required." }, 401);
  }
  await next();
}

export function opsMetricsTokenConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(configuredOpsToken(env));
}
