import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  CONSOLE_AEGIS_BASE,
  DOCS_AEGIS_BASE,
} from "@/lib/app-paths";
import {
  getMarketingFallbackUrl,
  isLoopbackApexHost,
  normalizeRedirectUrl,
  resolveHostAction,
  useTemporaryHostRedirects,
} from "@/lib/public-hosts";

function cloneRequestUrl(request: {
  nextUrl: URL | { href: string };
  url: string;
}): URL {
  const raw = request.nextUrl;
  if (raw instanceof URL) {
    return new URL(raw.href);
  }
  if (typeof raw === "object" && raw !== null && "href" in raw) {
    return new URL(String((raw as { href: string }).href));
  }
  return new URL(request.url);
}

function withRedirectReason(
  response: NextResponse,
  reason: string,
  requestHost: string | null,
): NextResponse {
  response.headers.set("X-Salanor-Redirect-Reason", reason);
  if (useTemporaryHostRedirects(requestHost)) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
  }
  return response;
}

function rewriteDevPathAliases(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (pathname === CONSOLE_AEGIS_BASE || pathname.startsWith(`${CONSOLE_AEGIS_BASE}/`)) {
    const suffix = pathname.slice(CONSOLE_AEGIS_BASE.length);
    const url = cloneRequestUrl(request);
    url.pathname = `/console${suffix}`;
    return NextResponse.rewrite(url);
  }
  if (pathname === DOCS_AEGIS_BASE || pathname.startsWith(`${DOCS_AEGIS_BASE}/`)) {
    const suffix = pathname.slice(DOCS_AEGIS_BASE.length);
    const url = cloneRequestUrl(request);
    url.pathname = `/aegis/docs${suffix}`;
    return NextResponse.rewrite(url);
  }
  if (pathname === "/console" || pathname.startsWith("/console/")) {
    const suffix = pathname === "/console" ? "" : pathname.slice("/console".length);
    const url = cloneRequestUrl(request);
    url.pathname = `${CONSOLE_AEGIS_BASE}${suffix}`;
    return NextResponse.redirect(url, 308);
  }
  return null;
}

export function handleHostRouting(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host");
  const { pathname } = request.nextUrl;

  if (isLoopbackApexHost(host)) {
    const alias = rewriteDevPathAliases(request);
    if (alias) return alias;
  }

  const decision = resolveHostAction(host, pathname);

  if (decision.action === "unknown") {
    return withRedirectReason(
      NextResponse.redirect(getMarketingFallbackUrl(host), 302),
      "unknown-host",
      host,
    );
  }

  if (decision.action === "redirect") {
    const location = normalizeRedirectUrl(decision.location);
    return withRedirectReason(
      NextResponse.redirect(location, decision.status ?? 302),
      `host-redirect:${pathname}`,
      host,
    );
  }

  if (decision.action === "rewrite") {
    const url = cloneRequestUrl(request);
    url.pathname = decision.pathname;
    const rewrite = NextResponse.rewrite(url);
    if (isLoopbackApexHost(host)) {
      rewrite.headers.set("X-Salanor-Dev-Route", "path-served");
    }
    return rewrite;
  }

  return null;
}
