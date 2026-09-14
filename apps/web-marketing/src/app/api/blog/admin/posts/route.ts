import { NextRequest, NextResponse } from "next/server";

import { isBlogAdminAuthorized } from "@/lib/blog/auth";
import { createBlogPost, listBlogPosts } from "@/lib/blog/store";
import type { BlogPostInput, BlogPostStatus } from "@/lib/blog/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!isBlogAdminAuthorized(req)) return unauthorized();
  const statusParam = req.nextUrl.searchParams.get("status");
  const status =
    statusParam === "draft" || statusParam === "published" || statusParam === "all"
      ? (statusParam as BlogPostStatus | "all")
      : "all";
  const posts = await listBlogPosts({ status, includeDrafts: true });
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  if (!isBlogAdminAuthorized(req)) return unauthorized();
  let body: BlogPostInput;
  try {
    body = (await req.json()) as BlogPostInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const post = await createBlogPost(body);
  return NextResponse.json({ post }, { status: 201 });
}
