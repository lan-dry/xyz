import type { NextConfig } from "next";

const stoaApiUrl = process.env.STOA_API_URL ?? "http://127.0.0.1:8094";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/id/:path*",
        destination: `${stoaApiUrl}/v1/stoa/id/:path*`,
      },
    ];
  },
};

export default nextConfig;
