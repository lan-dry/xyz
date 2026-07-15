import { NextResponse } from "next/server";

const ID_URL = (process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091").replace(/\/$/, "");
const COOKIE_NAME = "salanor_session";

/** Accept a session token from Platform Ops (:3003) and set the console cookie on :3000. */
export async function POST(request: Request) {
  let token: string | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { token?: string };
    token = body.token;
  } else {
    const form = await request.formData();
    token = form.get("token")?.toString();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=handoff_missing", request.url), 303);
  }

  const validate = await fetch(`${ID_URL}/v1/id/auth/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!validate.ok) {
    return NextResponse.redirect(new URL("/login?error=handoff_invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/aegis", request.url), 303);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}
