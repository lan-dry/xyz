import type { NextConfig } from "next";

const idApiUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";

const nextConfig: NextConfig = {
  async rewrites() {
    // beforeFiles: /api/contact must not depend on the App Router serverless
    // function (production was returning POST 404 while GET correctly 405'd).
    // /api/id/* already works in prod (auth/me → 401), so proxy contact the same way.
    return {
      beforeFiles: [
        {
          source: "/api/contact",
          destination: `${idApiUrl}/v1/id/public/contact`,
        },
      ],
      afterFiles: [
        {
          source: "/api/id/:path*",
          destination: `${idApiUrl}/v1/id/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
