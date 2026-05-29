/**
 * Pattern C routing: path prefixes in dev (`localhost:3000/app/...`), host + short paths in prod.
 * See docs/HOST_ROUTING.md.
 */

import {
  CONSOLE_ATTEST_BASE,
  CONSOLE_ATTEST_PUBLIC_PREFIX,
  DOCS_ATTEST_BASE,
  DOCS_ATTEST_PUBLIC_PREFIX,
} from "@/lib/app-paths";

export function normalizePublicHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end > 1) return trimmed.slice(1, end);
  }
  return trimmed.split(":")[0];
}

export type SiteMode = "development" | "production";

export function resolveSiteMode(): SiteMode {
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.SALANOR_ENV?.trim() === "local") return "development";
  return "development";
}

export function isDevelopmentRuntime(): boolean {
  return resolveSiteMode() === "development";
}

export function isProductionDomainHostname(hostname: string): boolean {
  const host = normalizePublicHostname(hostname);
  return host === "salanor.com" || host.endsWith(".salanor.com");
}

export function isProductionDomainUrl(location: string): boolean {
  if (location.startsWith("/")) return false;
  try {
    return isProductionDomainHostname(new URL(location).hostname);
  } catch {
    return false;
  }
}

export function isLoopbackApexHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader?.trim()) return false;
  const host = normalizePublicHostname(hostHeader);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function shouldUseLocalDevProductHosts(requestHost: string | null | undefined): boolean {
  return isLoopbackApexHost(requestHost);
}

type ParsedSiteUrl = {
  origin: string;
  hostname: string;
  port: string;
  scheme: "http" | "https";
};

function parseSiteUrl(raw: string): ParsedSiteUrl | null {
  try {
    const url = new URL(raw);
    const hostname = normalizePublicHostname(url.hostname);
    return {
      origin: raw.replace(/\/$/, ""),
      hostname,
      port: url.port || (hostname === "localhost" ? "3000" : ""),
      scheme: url.protocol === "https:" ? "https" : "http",
    };
  } catch {
    return null;
  }
}

function defaultSiteUrlForMode(): string {
  return resolveSiteMode() === "production" ? "https://salanor.com" : "http://localhost:3000";
}

function getMarketingSiteUrlRaw(): string {
  if (isDevelopmentRuntime()) {
    return process.env.PUBLIC_SITE_URL?.trim() || defaultSiteUrlForMode();
  }
  return (
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.MARKETING_FALLBACK_URL?.trim() ||
    defaultSiteUrlForMode()
  );
}

let cachedSite: ParsedSiteUrl | null | undefined;

function getParsedSiteUrl(): ParsedSiteUrl {
  if (cachedSite !== undefined) return cachedSite!;
  const raw = getMarketingSiteUrlRaw();
  cachedSite = parseSiteUrl(raw) ?? parseSiteUrl(defaultSiteUrlForMode())!;
  return cachedSite;
}

export function resetPublicSiteCache(): void {
  cachedSite = undefined;
}

const MARKETING_HOST_DEFAULTS = ["salanor.com", "www.salanor.com", "localhost", "127.0.0.1", "::1"] as const;
const APP_HOST = "app.salanor.com";
const DOCS_HOST = "docs.salanor.com";

function parseHostList(raw: string | undefined, defaults: readonly string[]): string[] {
  if (!raw?.trim()) return [...defaults];
  return raw
    .split(",")
    .map((entry) => normalizePublicHostname(entry.trim()))
    .filter(Boolean);
}

export function getMarketingHosts(): string[] {
  const site = getParsedSiteUrl();
  const hosts = parseHostList(process.env.MARKETING_HOSTS, MARKETING_HOST_DEFAULTS);
  if (!hosts.includes(site.hostname)) hosts.unshift(site.hostname);
  return hosts;
}

export function getAppHosts(): readonly string[] {
  return [APP_HOST];
}

export function getDocsHosts(): readonly string[] {
  return [DOCS_HOST];
}

export function getAllowedHosts(): ReadonlySet<string> {
  const hosts = new Set<string>(getMarketingHosts());
  for (const h of getAppHosts()) hosts.add(h);
  for (const h of getDocsHosts()) hosts.add(h);
  return hosts;
}

export function isAllowedHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  return getAllowedHosts().has(normalizePublicHostname(hostHeader));
}

export function isMarketingHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  return getMarketingHosts().includes(normalizePublicHostname(hostHeader));
}

export function isAppPublicHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  return getAppHosts().includes(normalizePublicHostname(hostHeader));
}

export function isDocsPublicHost(hostHeader: string | null | undefined): boolean {
  if (!hostHeader) return false;
  return getDocsHosts().includes(normalizePublicHostname(hostHeader));
}

/** @deprecated Use isAppPublicHost — kept for gradual migration of imports. */
export function isConsolePublicHost(hostHeader: string | null | undefined): boolean {
  return isAppPublicHost(hostHeader);
}

/** @deprecated Attest marketing is path-based on the marketing host in Pattern C. */
export function isAttestPublicHost(hostHeader: string | null | undefined): boolean {
  return false;
}

/** @deprecated Use isDocsPublicHost. */
export function isAttestDocsPublicHost(hostHeader: string | null | undefined): boolean {
  return isDocsPublicHost(hostHeader);
}

export function isAttestProductSurface(
  _hostHeader: string | null | undefined,
  pathname: string,
): boolean {
  return pathname === "/attest" || pathname.startsWith("/attest/");
}

export function getMarketingFallbackUrl(requestHost?: string | null): string {
  const site = getParsedSiteUrl();
  if (isLoopbackApexHost(requestHost) || site.hostname === "localhost") {
    return site.origin.replace(/\/$/, "");
  }
  return site.origin.replace(/\/$/, "");
}

export function getMarketingHomeUrl(requestHost?: string | null): string {
  return getMarketingFallbackUrl(requestHost);
}

function portSuffix(requestHost?: string | null): string {
  const explicit = process.env.NEXT_PUBLIC_DEV_PORT?.trim();
  if (explicit) return `:${explicit}`;
  if (requestHost?.includes(":")) {
    const port = requestHost.split(":").pop();
    if (port && /^\d+$/.test(port)) return `:${port}`;
  }
  const site = getParsedSiteUrl();
  return site.hostname === "localhost" && site.port ? `:${site.port}` : "";
}

export function buildPublicUrl(
  host: string,
  pathname = "",
  requestHost?: string | null,
): string {
  const site = getParsedSiteUrl();
  const scheme = host === "localhost" || host.endsWith(".localhost") ? "http" : site.scheme;
  const path =
    pathname === "" || pathname === "/"
      ? pathname === "/"
        ? "/"
        : ""
      : pathname.startsWith("/")
        ? pathname
        : `/${pathname}`;
  return `${scheme}://${host}${portSuffix(requestHost)}${path}`;
}

export function normalizeRedirectUrl(location: string): string {
  if (location.startsWith("/")) return location;
  try {
    const url = new URL(location);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/";
    }
    return url.toString();
  } catch {
    return location;
  }
}

function joinPublicUrl(base: string, pathname: string): string {
  const baseClean = base.replace(/\/$/, "");
  const path =
    pathname === "" || pathname === "/"
      ? "/"
      : pathname.startsWith("/")
        ? pathname
        : `/${pathname}`;
  return `${baseClean}${path}`;
}

export function getAttestProductPublicUrl(requestHost?: string | null): string {
  const site = getParsedSiteUrl();
  if (isLoopbackApexHost(requestHost) || site.hostname === "localhost") {
    return joinPublicUrl(site.origin, "/attest");
  }
  return joinPublicUrl(site.origin, "/attest");
}

export function resolveProductPublicUrlFromSite(
  siteUrl: string,
  productId: string,
  requestHost?: string | null,
): string {
  if (productId !== "attest") return siteUrl;
  if (requestHost && isLoopbackApexHost(requestHost)) {
    return getAttestProductPublicUrl(requestHost);
  }
  const site = parseSiteUrl(siteUrl.replace(/\/$/, ""));
  if (!site) return siteUrl;
  if (site.hostname === "localhost") {
    return joinPublicUrl(site.origin, "/attest");
  }
  return joinPublicUrl(site.origin, "/attest");
}

export function getDocsPublicUrl(requestHost?: string | null): string {
  const site = getParsedSiteUrl();
  if (isLoopbackApexHost(requestHost) || site.hostname === "localhost") {
    return joinPublicUrl(site.origin, DOCS_ATTEST_BASE);
  }
  return buildPublicUrl(DOCS_HOST, DOCS_ATTEST_PUBLIC_PREFIX, requestHost);
}

export function getConsolePublicUrl(hostHeader?: string | null): string {
  if (isAppPublicHost(hostHeader)) {
    return CONSOLE_ATTEST_PUBLIC_PREFIX;
  }
  const site = getParsedSiteUrl();
  if (isLoopbackApexHost(hostHeader) || site.hostname === "localhost") {
    return CONSOLE_ATTEST_BASE;
  }
  return buildPublicUrl(APP_HOST, CONSOLE_ATTEST_PUBLIC_PREFIX, hostHeader);
}

export function getAttestProductConfig(): { id: string; pathPrefix: string } {
  return { id: "attest", pathPrefix: "/attest" };
}

export function getAttestPublicHost(): string {
  return "salanor.com";
}

export function getAttestDocsPublicHost(): string {
  return DOCS_HOST;
}

export function getConsolePublicHost(): string {
  return APP_HOST;
}

export type HostActionType = "allow" | "rewrite" | "redirect" | "unknown";

export type HostAction =
  | { action: "allow" }
  | { action: "rewrite"; pathname: string }
  | { action: "redirect"; location: string; status?: number }
  | { action: "unknown" };

const PASSTHROUGH_PREFIXES = ["/sign-in", "/api/", "/_next/", "/admin"] as const;

function passthroughPath(pathname: string): boolean {
  return PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function prodAppHostRewrite(pathname: string): string | null {
  if (passthroughPath(pathname)) return null;
  if (pathname === "/" || pathname === "") {
    return "/console";
  }
  if (pathname === CONSOLE_ATTEST_PUBLIC_PREFIX || pathname.startsWith(`${CONSOLE_ATTEST_PUBLIC_PREFIX}/`)) {
    const suffix = pathname.slice(CONSOLE_ATTEST_PUBLIC_PREFIX.length);
    return `/console${suffix || ""}`;
  }
  return null;
}

function prodDocsHostRewrite(pathname: string): string | null {
  if (passthroughPath(pathname)) return null;
  if (pathname === "/" || pathname === "") {
    return "/attest/docs";
  }
  if (pathname === DOCS_ATTEST_PUBLIC_PREFIX || pathname.startsWith(`${DOCS_ATTEST_PUBLIC_PREFIX}/`)) {
    const suffix = pathname.slice(DOCS_ATTEST_PUBLIC_PREFIX.length);
    return `/attest/docs${suffix || ""}`;
  }
  return null;
}

function isLegacyDevSubdomain(host: string): boolean {
  return host.endsWith(".localhost") && !isLoopbackApexHost(host);
}

function legacyDevSubdomainRedirect(hostHeader: string, pathname: string): HostAction | null {
  const host = normalizePublicHostname(hostHeader);
  if (!isLegacyDevSubdomain(host)) return null;

  const site = getParsedSiteUrl();
  const origin = site.origin.replace(/\/$/, "");

  if (host === "app.attest.localhost" || host === "console.localhost") {
    const path =
      pathname === "/" || pathname === ""
        ? CONSOLE_ATTEST_BASE
        : pathname.startsWith("/console")
          ? `${CONSOLE_ATTEST_BASE}${pathname.slice("/console".length)}`
          : `${CONSOLE_ATTEST_BASE}${pathname}`;
    return { action: "redirect", location: `${origin}${path}`, status: 302 };
  }
  if (host === "docs.attest.localhost") {
    const path =
      pathname === "/" || pathname === ""
        ? DOCS_ATTEST_BASE
        : `${DOCS_ATTEST_BASE}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    return { action: "redirect", location: `${origin}${path}`, status: 302 };
  }
  if (host === "attest.localhost") {
    const path =
      pathname === "/" || pathname === ""
        ? "/attest"
        : pathname.startsWith("/attest")
          ? pathname
          : `/attest${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    return { action: "redirect", location: `${origin}${path}`, status: 302 };
  }
  return { action: "unknown" };
}

function prodMarketingPathRedirect(pathname: string, requestHost?: string | null): HostAction | null {
  if (pathname.startsWith("/app/")) {
    const suffix = pathname.slice("/app".length);
    return {
      action: "redirect",
      location: buildPublicUrl(APP_HOST, suffix || "/", requestHost),
      status: 301,
    };
  }
  if (pathname.startsWith("/docs/")) {
    const suffix = pathname.slice("/docs".length);
    return {
      action: "redirect",
      location: buildPublicUrl(DOCS_HOST, suffix || "/", requestHost),
      status: 301,
    };
  }
  if (pathname === "/console" || pathname.startsWith("/console/")) {
    const suffix =
      pathname === "/console"
        ? CONSOLE_ATTEST_PUBLIC_PREFIX
        : `${CONSOLE_ATTEST_PUBLIC_PREFIX}${pathname.slice("/console".length)}`;
    return {
      action: "redirect",
      location: buildPublicUrl(APP_HOST, suffix, requestHost),
      status: 301,
    };
  }
  return null;
}

export function resolveHostRewritePath(
  hostHeader: string | null | undefined,
  pathname: string,
): string | null {
  if (isAppPublicHost(hostHeader)) return prodAppHostRewrite(pathname);
  if (isDocsPublicHost(hostHeader)) return prodDocsHostRewrite(pathname);
  return null;
}

export function resolveHostAction(
  hostHeader: string | null | undefined,
  pathname: string,
): HostAction {
  if (!hostHeader?.trim()) return { action: "unknown" };

  const legacy = legacyDevSubdomainRedirect(hostHeader, pathname);
  if (legacy) return legacy;

  const host = normalizePublicHostname(hostHeader);

  if (isLoopbackApexHost(hostHeader)) {
    return { action: "allow" };
  }

  if (!getAllowedHosts().has(host)) return { action: "unknown" };

  if (isMarketingHost(hostHeader) && !isDevelopmentRuntime()) {
    const marketingRedirect = prodMarketingPathRedirect(pathname, hostHeader);
    if (marketingRedirect) return marketingRedirect;
  }

  const rewritePath = resolveHostRewritePath(hostHeader, pathname);
  if (rewritePath) return { action: "rewrite", pathname: rewritePath };

  return { action: "allow" };
}

export function hostRedirectStatus(
  requestHost: string | null | undefined,
  permanent = true,
): number {
  if (isDevelopmentRuntime() || isLoopbackApexHost(requestHost)) return 302;
  return permanent ? 301 : 302;
}

export function useTemporaryHostRedirects(requestHost?: string | null): boolean {
  return isDevelopmentRuntime() || isLoopbackApexHost(requestHost);
}

export function shouldGuardAgainstProductionRedirects(
  requestHost?: string | null,
): boolean {
  if (process.env.SALANOR_DEV_BYPASS_PROD_REDIRECT?.trim() === "1") return true;
  if (process.env.SALANOR_ENV?.trim() === "local") return true;
  if (isDevelopmentRuntime()) return true;
  return isLoopbackApexHost(requestHost);
}

/** @deprecated PRODUCT_HOST_REGISTRY removed in Pattern C. */
export const PRODUCT_HOST_REGISTRY = [
  { id: "attest", pathPrefix: "/attest", productSubdomain: "attest", devProductAlias: "attest.localhost" },
] as const;
