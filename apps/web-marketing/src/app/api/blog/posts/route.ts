import { NextRequest, NextResponse } from "next/server";

import { listBlogPosts } from "@/lib/blog/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;
  const posts = await listBlogPosts({ status: "published", tag });
  return NextResponse.json({ posts });
}
