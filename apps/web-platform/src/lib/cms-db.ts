import { getPrisma } from "@/lib/prisma";

export type CmsDbStatus = {
  research: boolean;
  careers: boolean;
};

async function tableReady(table: "research_posts" | "open_roles"): Promise<boolean> {
  const prisma = getPrisma();
  if (!prisma) return false;
  try {
    if (table === "research_posts") {
      await prisma.$queryRaw`SELECT 1 FROM research_posts LIMIT 1`;
    } else {
      await prisma.$queryRaw`SELECT 1 FROM open_roles LIMIT 1`;
    }
    return true;
  } catch {
    return false;
  }
}

export async function getCmsDbStatus(): Promise<CmsDbStatus> {
  if (!getPrisma()) {
    return { research: false, careers: false };
  }
  const [research, careers] = await Promise.all([
    tableReady("research_posts"),
    tableReady("open_roles"),
  ]);
  return { research, careers };
}

export function cmsSetupHint(): string {
  return "From repo root run: pnpm db:migrate (001_baseline includes research_posts and open_roles). Set DATABASE_URL on Platform Ops. Do not use pnpm db:push on the shared Aegis database.";
}
