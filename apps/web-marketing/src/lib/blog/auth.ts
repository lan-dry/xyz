import type { NextRequest } from "next/server";

export function blogAdminSecret(): string | null {
  const secret = process.env.BLOG_ADMIN_SECRET?.trim();
  return secret || null;
}

export function isBlogAdminAuthorized(req: NextRequest): boolean {
  const secret = blogAdminSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export function blogAdminConfigured(): boolean {
  return Boolean(blogAdminSecret());
}
