import type { NextConfig } from "next";

/** Server-side proxy targets (browser uses same-origin `/api/*`: see src/lib/*.ts). */
const aegisApiUrl =
  process.env.AEGIS_API_URL ??
  process.env.NEXT_PUBLIC_AEGIS_API_URL ??
  "http://127.0.0.1:8080";
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

const nextConfig: NextConfig = {
  transpilePackages: ["@salanor/ui"],
  async redirects() {
    return [
      {
        source: "/aegis/settings/members",
        destination: "/aegis/members",
        permanent: false,
      },
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
