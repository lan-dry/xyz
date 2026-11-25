import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function apiBase(): string {
  const raw =
    process.env.AEGIS_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_AEGIS_API_URL?.trim() ||
    "http://127.0.0.1:8080";
  return raw.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }
  try {
    const res = await fetch(`${apiBase()}/v1/public/access-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Empty response" }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "access_request_unavailable", message: "Could not reach the access-request API." },
      { status: 502 },
    );
  }
}
