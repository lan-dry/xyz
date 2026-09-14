import { NextRequest, NextResponse } from "next/server";

import { isBlogAdminAuthorized } from "@/lib/blog/auth";
import { deleteBlogPost, getBlogPostById, updateBlogPost } from "@/lib/blog/store";
import type { BlogPostInput } from "@/lib/blog/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!isBlogAdminAuthorized(req)) return unauthorized();
  const { id } = await params;
  const post = await getBlogPostById(id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isBlogAdminAuthorized(req)) return unauthorized();
  const { id } = await params;
  let body: BlogPostInput;
  try {
    body = (await req.json()) as BlogPostInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const post = await updateBlogPost(id, body);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isBlogAdminAuthorized(req)) return unauthorized();
  const { id } = await params;
  const ok = await deleteBlogPost(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
