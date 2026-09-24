import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  githubDeleteFile,
  githubGetTextFile,
  githubPutBinaryFile,
  githubPutFile,
  githubWriteEnabled,
} from "./github";
import {
  blogContentRepoPath,
  blogMediaDir,
  blogMediaRepoPath,
  blogPostFilePath,
  localContentAvailable,
} from "./paths";
import { serializeBlogMarkdown } from "./serialize";
import type { BlogEditorContext, BlogPostSaveInput } from "./types";

function safeMediaFilename(original: string): string {
  const base = path.basename(original).replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  const stamp = Date.now().toString(36);
  const ext = path.extname(base) || ".bin";
  const stem = path.basename(base, ext) || "file";
  return `${stem.slice(0, 48)}-${stamp}${ext.toLowerCase()}`;
}

async function writePostLocal(
  input: BlogPostSaveInput,
  ctx: BlogEditorContext,
  previousSlug?: string | null,
): Promise<{ slug: string }> {
  const slug = input.slug.trim().toLowerCase();
  const target = blogPostFilePath(slug);
  mkdirSync(path.dirname(target), { recursive: true });
  const markdown = serializeBlogMarkdown({ ...input, slug }, ctx);

  if (previousSlug && previousSlug !== slug) {
    const oldPath = blogPostFilePath(previousSlug);
    if (existsSync(oldPath)) unlinkSync(oldPath);
  }

  writeFileSync(target, markdown, "utf8");
  return { slug };
}

async function writePostGithub(
  input: BlogPostSaveInput,
  ctx: BlogEditorContext,
  previousSlug?: string | null,
): Promise<{ slug: string }> {
  const slug = input.slug.trim().toLowerCase();
  const repoPath = blogContentRepoPath(slug);
  const markdown = serializeBlogMarkdown({ ...input, slug }, ctx);
  const existing = await githubGetTextFile(repoPath);
  const message = ctx.isCreate
    ? `blog: create ${slug} (ops by ${ctx.editorEmail})`
    : `blog: update ${slug} (ops by ${ctx.editorEmail})`;

  await githubPutFile(repoPath, markdown, message, existing?.sha);

  if (previousSlug && previousSlug !== slug) {
    const oldPath = blogContentRepoPath(previousSlug);
    await githubDeleteFile(oldPath, `blog: remove old slug ${previousSlug} (ops by ${ctx.editorEmail})`);
  }

  return { slug };
}

export async function saveMarketingBlogPost(
  input: BlogPostSaveInput,
  ctx: BlogEditorContext,
  options?: { previousSlug?: string | null },
): Promise<{ slug: string }> {
  if (localContentAvailable() && process.env.BLOG_ADMIN_FORCE_GITHUB?.trim() !== "1") {
    return writePostLocal(input, ctx, options?.previousSlug);
  }
  if (!githubWriteEnabled()) {
    throw new Error(
      "Blog save requires local repo checkout or BLOG_GITHUB_TOKEN (GitHub Contents API).",
    );
  }
  return writePostGithub(input, ctx, options?.previousSlug);
}

export async function uploadMarketingBlogMedia(
  file: File,
  editorEmail: string,
): Promise<{ publicPath: string }> {
  const filename = safeMediaFilename(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());

  if (localContentAvailable() && process.env.BLOG_ADMIN_FORCE_GITHUB?.trim() !== "1") {
    const dir = blogMediaDir();
    mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, filename);
    writeFileSync(dest, bytes);
    return { publicPath: `/blog/media/${filename}` };
  }

  if (!githubWriteEnabled()) {
    throw new Error("Media upload requires local repo or BLOG_GITHUB_TOKEN.");
  }

  const repoPath = blogMediaRepoPath(filename);
  const existing = await githubGetTextFile(repoPath);
  await githubPutBinaryFile(
    repoPath,
    bytes,
    `blog: upload media ${filename} (ops by ${editorEmail})`,
    existing?.sha,
  );
  return { publicPath: `/blog/media/${filename}` };
}

/** @internal — slug rename helper for local only */
export function renameLocalBlogSlugFile(oldSlug: string, newSlug: string): void {
  const oldPath = blogPostFilePath(oldSlug);
  const newPath = blogPostFilePath(newSlug);
  if (existsSync(oldPath) && !existsSync(newPath)) {
    renameSync(oldPath, newPath);
  }
}
