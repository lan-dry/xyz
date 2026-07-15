const path = require("path");
const { loadEnvConfig } = require("@next/env");

// Monorepo: shared `.env` at repo root (Nx runs Next from apps/web).
loadEnvConfig(path.join(__dirname, "../.."));

const { withNx } = require("@nx/next");

/** @type {import('next').NextConfig} */
const nextConfig = withNx({
  nx: {
    babelUpwardRootMode: true,
  },
  transpilePackages: [
    "@salanor/auth",
    "@salanor/aegis-ledger-sdk",
    "@salanor/aegis-bus",
    "@salanor/aegis-storage",
  ],
});

module.exports = nextConfig;
