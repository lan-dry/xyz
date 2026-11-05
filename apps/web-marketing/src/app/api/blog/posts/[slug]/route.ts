import { NextResponse } from "next/server";

import { getBlogPostBySlug, isBlogPostLive } from "@/lib/blog/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post || !isBlogPostLive(post)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ post });
}
