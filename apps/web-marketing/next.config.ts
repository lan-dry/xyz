import type { NextConfig } from "next";

const idApiUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/id/:path*",
        destination: `${idApiUrl}/v1/id/:path*`,
      },
    ];
  },
};

export default nextConfig;
