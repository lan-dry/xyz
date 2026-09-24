import type { NextConfig } from "next";

const idApiUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";
const billingApiUrl = process.env.BILLING_API_URL ?? "http://127.0.0.1:8093";

const nextConfig: NextConfig = {
  transpilePackages: ["@salanor/marketing-blog"],
  async redirects() {
    return [{ source: "/leads", destination: "/content/leads", permanent: false }];
  },
  async rewrites() {
    return [
      {
        source: "/api/id/:path*",
        destination: `${idApiUrl}/v1/id/:path*`,
      },
      {
        source: "/api/platform/:path*",
        destination: `${idApiUrl}/v1/id/platform/:path*`,
      },
      {
        source: "/api/billing/:path*",
        destination: `${billingApiUrl}/v1/billing/:path*`,
      },
    ];
  },
};

export default nextConfig;
