import { NextRequest } from "next/server";

export function verifyNewsletterOpsSecret(req: NextRequest): boolean {
  const secret = process.env.NEWSLETTER_OPS_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim();
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice("Bearer ".length) === secret;
}
