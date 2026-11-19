import type { NextConfig } from "next";

/** Server-side proxy targets (browser uses same-origin `/api/*`: see src/lib/*.ts). */
// Browser always calls same-origin `/api/console/*`; this is the server-side
// rewrite target only. Prefer AEGIS_API_URL. Default :8088 matches the local
// production-like API boot (demo:up still uses :8080 — set AEGIS_API_URL there).
const aegisApiUrl =
  process.env.AEGIS_API_URL ??
  process.env.NEXT_PUBLIC_AEGIS_API_URL ??
  "http://127.0.0.1:8088";
const idApiUrl =
  process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";
const insuranceApiUrl =
  process.env.INSURANCE_API_URL ?? "http://127.0.0.1:8092";
const billingApiUrl =
  process.env.BILLING_API_URL ?? "http://127.0.0.1:8093";

/** Avoid proxying insurance to marketing/www (common misconfig → CORS “Failed to fetch”). */
function isUsableBackendUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "www.salanor.com" || host === "salanor.com") return false;
    return true;
  } catch {
    return false;
  }
}

const deploymentId =
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  undefined;

const nextConfig: NextConfig = {
  // Soft-nav hard-reloads when the server deploy id changes, so a tab that
  // opened before a deploy cannot keep driving an old client shell forever.
  ...(deploymentId ? { deploymentId } : {}),
  // `AEGIS_UI_PROFILE=bank_demo` works as well as NEXT_PUBLIC_AEGIS_UI_PROFILE.
  env: {
    NEXT_PUBLIC_AEGIS_UI_PROFILE:
      process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE ?? process.env.AEGIS_UI_PROFILE ?? "",
  },
  transpilePackages: ["@salanor/ui"],
  // API routes only (never client). External avoids bundling Node SDK into webpack.
  serverExternalPackages: ["@salanor/aegis"],
  async redirects() {
    return [
      // Members stays under Settings tabs (/aegis/settings/members).
      // /aegis/members → settings/members is handled by the page redirect.
      {
        source: "/aegis/settings/keys",
        destination: "/aegis/keys",
        permanent: false,
      },
      {
        source: "/aegis/settings/policies",
        destination: "/aegis/policies",
        permanent: false,
      },
      {
        source: "/coverage",
        destination: "/aegis/coverage",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    const rules = [
      {
        source: "/api/console/:path*",
        destination: `${aegisApiUrl}/v1/console/:path*`,
      },
      {
        source: "/api/public/:path*",
        destination: `${aegisApiUrl}/v1/public/:path*`,
      },
      {
        source: "/api/id/:path*",
        destination: `${idApiUrl}/v1/id/:path*`,
      },
      {
        source: "/api/billing/:path*",
        destination: `${billingApiUrl}/v1/billing/:path*`,
      },
    ];
    if (isUsableBackendUrl(insuranceApiUrl)) {
      rules.splice(3, 0, {
        source: "/api/insurance/:path*",
        destination: `${insuranceApiUrl}/v1/insurance/:path*`,
      });
    }
    return rules;
  },
};

export default nextConfig;
