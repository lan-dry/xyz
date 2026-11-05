import { existsSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const RHEL_ENGINE = "libquery_engine-rhel-openssl-3.0.x.so.node";

/** Point Prisma at the engine copied into this app. The monorepo output path is not in the Vercel function. */
function useBundledQueryEngine(): void {
  if (process.platform !== "linux") return;
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY?.trim()) return;
  const candidates = [
    path.join(process.cwd(), "apps", "web-platform", "generated", "prisma", RHEL_ENGINE),
    path.join(process.cwd(), "generated", "prisma", RHEL_ENGINE),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) process.env.PRISMA_QUERY_ENGINE_LIBRARY = found;
}

/** Returns a shared client when DATABASE_URL is set; otherwise null (safe during Vercel build). */
export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL?.trim()) {
    return null;
  }
  if (!globalForPrisma.prisma) {
    useBundledQueryEngine();
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
