import { NextResponse } from "next/server";

import { getPlatformSessionServer } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Active + pending + unsubscribed subscribers export (Ops). */
export async function GET() {
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.read")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "DATABASE_URL not configured" }, { status: 503 });
  }

  type Row = {
    email: string;
    created_at: Date;
    confirmed_at: Date | null;
    unsubscribed_at: Date | null;
    source: string;
  };

  let rows: Row[] = [];
  try {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT email, created_at, confirmed_at, unsubscribed_at, source
      FROM newsletter_subscribers
      ORDER BY created_at ASC
    `;
  } catch {
    return NextResponse.json({ error: "Newsletter tables missing" }, { status: 503 });
  }

  const header = "email,status,source,subscribed_at,confirmed_at,unsubscribed_at";
  const lines = rows.map((r) => {
    const status = r.unsubscribed_at
      ? "unsubscribed"
      : r.confirmed_at
        ? "active"
        : "pending";
    return [
      csvEscape(r.email),
      status,
      csvEscape(r.source),
      r.created_at.toISOString(),
      r.confirmed_at?.toISOString() ?? "",
      r.unsubscribed_at?.toISOString() ?? "",
    ].join(",");
  });

  const body = [header, ...lines].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="newsletter-subscribers-${stamp}.csv"`,
    },
  });
}
