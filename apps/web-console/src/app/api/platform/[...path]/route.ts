import { NextRequest, NextResponse } from "next/server";

const idUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";

async function proxy(req: NextRequest, path: string[]) {
  const secret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Platform provisioning is disabled. Set PLATFORM_BOOTSTRAP_SECRET in .env (server)." },
      { status: 503 },
    );
  }

  const suffix = path.join("/");
  const url = new URL(`/v1/id/platform/${suffix}`, idUrl.replace(/\/$/, ""));
  url.search = req.nextUrl.search;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("X-Platform-Secret", secret);

  const init: RequestInit = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const upstream = await fetch(url.toString(), init);
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
