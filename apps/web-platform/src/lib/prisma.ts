import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Returns a shared client when DATABASE_URL is set; otherwise null (safe during Vercel build). */
export function getPrisma(): PrismaClient | null {
  if (!process.env.DATABASE_URL?.trim()) {
    return null;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}
