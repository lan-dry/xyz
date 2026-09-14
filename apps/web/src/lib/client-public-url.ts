"use client";

import {
  CONSOLE_AEGIS_BASE,
  CONSOLE_AEGIS_PUBLIC_PREFIX,
  DOCS_AEGIS_BASE,
  DOCS_AEGIS_PUBLIC_PREFIX,
} from "@/lib/app-paths";
import {
  getAegisDocsPublicHost,
  getAegisProductPublicUrl,
  getConsolePublicUrl,
  getDocsPublicUrl,
  getMarketingHomeUrl,
  isAppPublicHost,
  isDocsPublicHost,
  isLoopbackApexHost,
  resolveProductPublicUrlFromSite,
  shouldUseLocalDevProductHosts,
} from "@/lib/public-hosts";

export function resolveEffectiveRequestHost(hostHint?: string | null): string | null {
  if (hostHint?.trim()) return hostHint.trim();
  if (typeof window !== "undefined") return window.location.host;
  return null;
}

function isProductionSalanorOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "salanor.com" || host.endsWith(".salanor.com");
  } catch {
    return false;
  }
}

export function getClientMarketingHomeUrl(hostHint?: string | null): string {
  const host = resolveEffectiveRequestHost(hostHint);
  if (host && shouldUseLocalDevProductHosts(host)) {
    return getMarketingHomeUrl(host);
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl && !isProductionSalanorOrigin(siteUrl)) {
    return siteUrl.replace(/\/$/, "");
  }
  if (siteUrl && isProductionSalanorOrigin(siteUrl)) {
    return "/";
  }
  return getMarketingHomeUrl(host);
}

export function getClientAegisProductUrl(hostHint?: string | null): string {
  const host = resolveEffectiveRequestHost(hostHint);
  if (host && shouldUseLocalDevProductHosts(host)) {
    return getAegisProductPublicUrl(host);
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl && isProductionSalanorOrigin(siteUrl) && !host) {
    return "/aegis";
  }
  if (siteUrl) {
    return resolveProductPublicUrlFromSite(siteUrl, "aegis", host);
  }
  return getAegisProductPublicUrl(host);
}

export function getClientDocsPublicUrl(hostHint?: string | null): string {
  const host = resolveEffectiveRequestHost(hostHint);
  if (host && isDocsPublicHost(host)) {
    return isLoopbackApexHost(host) ? DOCS_AEGIS_BASE : DOCS_AEGIS_PUBLIC_PREFIX;
  }
  if (host && shouldUseLocalDevProductHosts(host)) {
    return getDocsPublicUrl(host);
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl && isProductionSalanorOrigin(siteUrl) && !host) {
    return `https://${getAegisDocsPublicHost()}${DOCS_AEGIS_PUBLIC_PREFIX}`;
  }
  return getDocsPublicUrl(host);
}

export function getClientConsolePublicUrl(hostHint?: string | null): string {
  const host = resolveEffectiveRequestHost(hostHint);
  if (host && isAppPublicHost(host)) {
    return CONSOLE_AEGIS_PUBLIC_PREFIX;
  }
  if (host && shouldUseLocalDevProductHosts(host)) {
    return CONSOLE_AEGIS_BASE;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl && isProductionSalanorOrigin(siteUrl) && !host) {
    return CONSOLE_AEGIS_PUBLIC_PREFIX;
  }
  return getConsolePublicUrl(host);
}
