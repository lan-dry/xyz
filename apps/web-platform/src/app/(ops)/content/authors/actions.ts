"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlatformSessionAction } from "@/lib/platform-server-session";
import { publicProfileFromForm, updateResearchBylineForAccount } from "@/lib/research-author";
import { gcUnreferencedBlogMedia } from "@/lib/cms-media-gc";
import { getPrisma } from "@/lib/prisma";

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is not configured");
  return prisma;
}

export async function updateMyByline(formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const profile = publicProfileFromForm(formData);

  const prisma = requirePrisma();
  await updateResearchBylineForAccount(prisma, session.account_id, profile);

  await gcUnreferencedBlogMedia(session.email);

  revalidatePath("/content/authors");
  revalidatePath("/content/research");
  revalidatePath("/content/blog");
  redirect("/content/authors?saved=1");
}
