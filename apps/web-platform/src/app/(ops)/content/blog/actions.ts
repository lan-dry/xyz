"use server";

import {
  getMarketingBlogPostBySlug,
  saveMarketingBlogPost,
  uploadMarketingBlogMedia,
  type BlogPostSaveInput,
  type BlogPostStatus,
} from "@salanor/marketing-blog";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlatformSessionAction } from "@/lib/platform-server-session";

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseStatus(raw: FormDataEntryValue | null): BlogPostStatus {
  return raw === "published" ? "published" : "draft";
}

function parsePublishedAt(raw: FormDataEntryValue | null, status: BlogPostStatus): string | null {
  if (status !== "published") return null;
  if (typeof raw !== "string" || !raw.trim()) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function inputFromForm(formData: FormData): BlogPostSaveInput {
  const status = parseStatus(formData.get("status"));
  return {
    title: String(formData.get("title") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    excerpt: String(formData.get("excerpt") ?? "").trim(),
    bodyMarkdown: String(formData.get("bodyMarkdown") ?? ""),
    authorName: String(formData.get("authorName") ?? "").trim(),
    authorRole: String(formData.get("authorRole") ?? "").trim() || null,
    tags: parseTags(formData.get("tags")),
    status,
    publishedAt: parsePublishedAt(formData.get("publishedAt"), status),
    seoTitle: String(formData.get("seoTitle") ?? "").trim() || null,
    seoDescription: String(formData.get("seoDescription") ?? "").trim() || null,
    coverImageUrl: String(formData.get("coverImageUrl") ?? "").trim() || null,
  };
}

export async function createBlogPost(formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const input = inputFromForm(formData);
  if (!input.title || !input.slug || !input.excerpt || !input.authorName) {
    throw new Error("Missing required blog fields");
  }

  const existing = await getMarketingBlogPostBySlug(input.slug);
  if (existing) throw new Error("A post with this slug already exists");

  const { slug } = await saveMarketingBlogPost(input, {
    editorEmail: session.email,
    isCreate: true,
  });

  revalidatePath("/content/blog");
  redirect(`/content/blog/${encodeURIComponent(slug)}`);
}

export async function updateBlogPost(previousSlug: string, formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const prior = await getMarketingBlogPostBySlug(previousSlug);
  if (!prior) throw new Error("Post not found");

  const input = inputFromForm(formData);
  if (!input.title || !input.slug || !input.excerpt || !input.authorName) {
    throw new Error("Missing required blog fields");
  }

  if (input.slug !== previousSlug) {
    const collision = await getMarketingBlogPostBySlug(input.slug);
    if (collision) throw new Error("Target slug already in use");
  }

  const { slug } = await saveMarketingBlogPost(
    input,
    {
      editorEmail: session.email,
      isCreate: false,
      previousCreatedByEmail: prior.createdByEmail,
    },
    { previousSlug },
  );

  revalidatePath("/content/blog");
  revalidatePath(`/content/blog/${previousSlug}`);
  revalidatePath(`/content/blog/${slug}`);
  redirect(`/content/blog/${encodeURIComponent(slug)}?saved=1`);
}

export async function uploadBlogMedia(formData: FormData) {
  const session = await assertPlatformSessionAction("platform:content.write");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("File must be 25 MB or smaller");
  }

  const { publicPath } = await uploadMarketingBlogMedia(file, session.email);
  revalidatePath("/content/blog");
  return { publicPath };
}
