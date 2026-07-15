import { NextResponse } from "next/server";

const idUrl = process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091";
const platformSecret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();

/** Server-only proxy — never expose PLATFORM_BOOTSTRAP_SECRET to the browser. */
export async function POST(request: Request) {
  if (!platformSecret) {
    return NextResponse.json(
      {
        error:
          "Platform provisioning is disabled. Set PLATFORM_BOOTSTRAP_SECRET in .env (server).",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 422 });
  }

  const response = await fetch(`${idUrl.replace(/\/$/, "")}/v1/id/platform/organizations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Secret": platformSecret,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
