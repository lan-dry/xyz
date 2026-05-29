"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

function toDate(input: FormDataEntryValue | null): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const value = new Date(input);
  return Number.isNaN(value.getTime()) ? null : value;
}

export async function createRole(formData: FormData) {
  await requireAdminPermissionSession("admin:cms:write");
  await prisma.openRole.create({
    data: {
      title: String(formData.get("title") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      team: String(formData.get("team") ?? "General").trim(),
      location: String(formData.get("location") ?? "Remote").trim(),
      seniority: String(formData.get("seniority") ?? "mid").trim(),
      employmentType: String(formData.get("employmentType") ?? "full_time").trim(),
      summary: String(formData.get("summary") ?? "").trim(),
      requirements: String(formData.get("requirements") ?? "").trim(),
      compensationRange: String(formData.get("compensationRange") ?? "").trim() || null,
      status: String(formData.get("status") ?? "open").trim(),
      postedAt: toDate(formData.get("postedAt")) ?? new Date(),
      closesAt: toDate(formData.get("closesAt")),
    },
  });
  revalidatePath("/admin/careers");
  revalidatePath("/careers");
}

export async function updateRole(id: string, formData: FormData) {
  await requireAdminPermissionSession("admin:cms:write");
  await prisma.openRole.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim(),
      team: String(formData.get("team") ?? "").trim(),
      location: String(formData.get("location") ?? "").trim(),
      seniority: String(formData.get("seniority") ?? "").trim(),
      employmentType: String(formData.get("employmentType") ?? "").trim(),
      summary: String(formData.get("summary") ?? "").trim(),
      requirements: String(formData.get("requirements") ?? "").trim(),
      compensationRange: String(formData.get("compensationRange") ?? "").trim() || null,
      status: String(formData.get("status") ?? "").trim(),
      postedAt: toDate(formData.get("postedAt")) ?? new Date(),
      closesAt: toDate(formData.get("closesAt")),
    },
  });
  revalidatePath("/admin/careers");
  revalidatePath(`/admin/careers/${id}`);
  revalidatePath("/careers");
}
