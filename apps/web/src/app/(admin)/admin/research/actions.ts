"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

function toDate(input: FormDataEntryValue | null): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function createResearchPost(formData: FormData) {
  await requireAdminPermissionSession("admin:cms:write");
  await prisma.researchPost.create({
    data: {
      title: String(formData.get("title") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      dek: String(formData.get("excerpt") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      status: String(formData.get("status") ?? "draft").trim(),
      track: "ops",
      readingMinutes: Number(formData.get("readingMinutes") ?? 5) || 5,
      publishedAt: toDate(formData.get("publishedAt")),
    },
  });
  revalidatePath("/admin/research");
  revalidatePath("/research");
}

export async function updateResearchPost(id: string, formData: FormData) {
  await requireAdminPermissionSession("admin:cms:write");
  await prisma.researchPost.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      dek: String(formData.get("excerpt") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      status: String(formData.get("status") ?? "draft").trim(),
      publishedAt: toDate(formData.get("publishedAt")),
      readingMinutes: Number(formData.get("readingMinutes") ?? 5) || 5,
      track: String(formData.get("track") ?? "ops").trim() || "ops",
    },
  });
  revalidatePath("/admin/research");
  revalidatePath(`/admin/research/${id}`);
  revalidatePath("/research");
}
