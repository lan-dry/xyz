"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlatformSessionAction } from "@/lib/platform-server-session";
import { gcUnreferencedBlogMedia } from "@/lib/cms-media-gc";
import { getPrisma } from "@/lib/prisma";
import { getResearchBylineForAccount } from "@/lib/research-author";

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DATABASE_URL is not configured");
  return prisma;
}

function toDate(input: FormDataEntryValue | null): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

function parsePublishedAt(raw: FormDataEntryValue | null, status: string): Date | null {
  const parsed = toDate(raw);
  if (status === "published") return parsed ?? new Date();
  return parsed;
}

function researchDataFromForm(formData: FormData) {
  const status = String(formData.get("status") ?? "draft").trim();
  return {
    title: String(formData.get("title") ?? "").trim(),
    slug: String(formData.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
    dek: String(formData.get("excerpt") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    status,
    track: String(formData.get("track") ?? "policy").trim() || "policy",
    readingMinutes: Number(formData.get("readingMinutes") ?? 8) || 8,
    publishedAt: parsePublishedAt(formData.get("publishedAt"), status),
    heroImageUrl: String(formData.get("heroImageUrl") ?? "").trim() || null,
    ogImageUrl: String(formData.get("ogImageUrl") ?? "").trim() || null,
  };
}

async function researchWritePayload(
  prisma: ReturnType<typeof requirePrisma>,
  session: Awaited<ReturnType<typeof assertPlatformSessionAction>>,
  data: ReturnType<typeof researchDataFromForm>,
  previousStatus?: string,
) {
  if (data.status === "published") {
    const byline = await getResearchBylineForAccount(prisma, session.account_id);
    if (!byline?.name?.trim() || !byline.role?.trim() || !byline.bio?.trim()) {
      throw new Error(
        "Complete Content → My public profile (name, title, bio) before publishing research.",
      );
    }
  }

  const payload: Parameters<typeof prisma.researchPost.create>[0]["data"] = {
    ...data,
    authorAccountId: session.account_id,
    lastEditedByAccountId: session.account_id,
  };

  if (data.status === "published" && previousStatus !== "published") {
    payload.publishedByAccountId = session.account_id;
  }

  return payload;
}

export async function createResearchPost(formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const data = researchDataFromForm(formData);
  if (!data.title || !data.slug || !data.dek || !data.body) {
    throw new Error("Missing required research fields");
  }

  const prisma = requirePrisma();
  const payload = await researchWritePayload(prisma, session, data);
  const created = await prisma.researchPost.create({ data: payload });
  await gcUnreferencedBlogMedia(session.email);

  revalidatePath("/content/research");
  redirect(`/content/research/${created.id}?created=1`);
}

export async function updateResearchPost(id: string, formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const data = researchDataFromForm(formData);
  const prisma = requirePrisma();

  const existing = await prisma.researchPost.findUnique({ where: { id } });
  if (!existing) throw new Error("Research post not found");

  const payload = await researchWritePayload(prisma, session, data, existing.status);
  await prisma.researchPost.update({
    where: { id },
    data: payload,
  });

  await gcUnreferencedBlogMedia(session.email);

  revalidatePath("/content/research");
  revalidatePath(`/content/research/${id}`);
  redirect(`/content/research/${id}?saved=1`);
}

export async function deleteResearchPost(id: string) {
  const session = await assertPlatformSessionAction("platform:content.write");
  await requirePrisma().researchPost.delete({ where: { id } });
  await gcUnreferencedBlogMedia(session.email);
  revalidatePath("/content/research");
  redirect("/content/research?deleted=1");
}
