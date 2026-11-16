import { NextResponse } from "next/server";

/**
 * Server-only helper for the bank simulator routes (/api/demo/simulator/*).
 * The aegis-api ingest key lives here, on the server. The browser never sees it.
 * Everything 404s unless the bank_demo UI profile is on.
 */

function aegisBase(): string {
  return (
    process.env.AEGIS_API_URL ??
    process.env.NEXT_PUBLIC_AEGIS_API_URL ??
    "http://127.0.0.1:8080"
  ).replace(/\/$/, "");
}

function ingestKey(): string | null {
  const key =
    process.env.AEGIS_DEMO_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_KEY?.trim() ||
    process.env.AEGIS_INGEST_DEV_KEY?.trim();
  return key || null;
}

export function simulatorEnabled(): boolean {
  const profile = (
    process.env.NEXT_PUBLIC_AEGIS_UI_PROFILE ??
    process.env.AEGIS_UI_PROFILE ??
    ""
  )
    .trim()
    .toLowerCase();
  return profile === "bank_demo";
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Caller must have a console session (cookie is forwarded to aegis-api). */
async function hasConsoleSession(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  try {
    const res = await fetch(`${aegisBase()}/v1/console/cases/summary`, {
      headers: { cookie },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function proxySimulator(
  request: Request,
  path: "stories" | "story" | "reset",
  method: "GET" | "POST",
): Promise<NextResponse> {
  if (!simulatorEnabled()) return notFound();
  if (!(await hasConsoleSession(request))) {
    return NextResponse.json({ error: "Sign in to use the simulator." }, { status: 401 });
  }
  const key = ingestKey();
  if (!key) {
    return NextResponse.json(
      {
        error:
          "Simulator is not configured: set AEGIS_INGEST_KEY (or AEGIS_DEMO_INGEST_KEY) on the console server.",
      },
      { status: 503 },
    );
  }
  let body: string | undefined;
  if (method === "POST") {
    body = await request.text();
  }
  try {
    const res = await fetch(`${aegisBase()}/v1/aegis/demo/simulator/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body && body.length > 0 ? body : method === "POST" ? "{}" : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Aegis API unreachable" },
      { status: 502 },
    );
  }
}
