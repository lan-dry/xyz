import { Auth, setEnvDefaults } from "@auth/core";
import type { NextAuthConfig } from "next-auth";
import type { NextRequest } from "next/server";

import { shouldPreserveAuthRequestOrigin } from "./auth-request-origin";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

function withNextAuthDefaults(config: NextAuthConfig): NextAuthConfig {
  const resolved = { ...config, basePath: config.basePath ?? "/api/auth" };
  setEnvDefaults(process.env, resolved, true);
  return resolved;
}

/** Route handlers that keep the request origin when AUTH_TRUST_HOST + local cookie mode. */
export function createTrustHostAuthHandlers(config: NextAuthConfig): {
  GET: (req: NextRequest, ctx: RouteContext) => Promise<Response>;
  POST: (req: NextRequest, ctx: RouteContext) => Promise<Response>;
} {
  const resolvedConfig = withNextAuthDefaults(config);

  const handler = async (req: NextRequest, _ctx: RouteContext): Promise<Response> =>
    Auth(req, resolvedConfig);

  return { GET: handler, POST: handler };
}

export function resolveAuthRouteHandlers(
  config: NextAuthConfig,
  defaultHandlers: { GET: (req: NextRequest, ctx: RouteContext) => Promise<Response>; POST: (req: NextRequest, ctx: RouteContext) => Promise<Response> },
): {
  GET: (req: NextRequest, ctx: RouteContext) => Promise<Response>;
  POST: (req: NextRequest, ctx: RouteContext) => Promise<Response>;
} {
  if (!shouldPreserveAuthRequestOrigin()) return defaultHandlers;
  return createTrustHostAuthHandlers(config);
}
