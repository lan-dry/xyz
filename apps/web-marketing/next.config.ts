import type { NextConfig } from "next";

const idApiUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";

const consoleUrl =
  process.env.NEXT_PUBLIC_CONSOLE_URL ??
  (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
    ? "https://app.salanor.com"
    : "http://localhost:3000");

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Legacy URLs indexed by Google (pre–marketing IA)
      { source: "/product", destination: "/products/aegis", permanent: true },
      { source: "/demo", destination: "/contact", permanent: true },
      { source: "/about-us", destination: "/about", permanent: true },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/news", destination: "/blog", permanent: true },
      { source: "/market-impact", destination: "/products/aegis", permanent: true },
      { source: "/auth/login", destination: `${consoleUrl}/login`, permanent: true },
      { source: "/auth/signup", destination: `${consoleUrl}/signup`, permanent: true },
      { source: "/auth/:path*", destination: `${consoleUrl}/:path*`, permanent: true },
    ];
  },
  async rewrites() {
    // Do NOT rewrite /api/contact — App Router route handles ID proxy + DB fallback.
    return [
      {
        source: "/api/id/:path*",
        destination: `${idApiUrl}/v1/id/:path*`,
      },
    ];
  },
};

export default nextConfig;
