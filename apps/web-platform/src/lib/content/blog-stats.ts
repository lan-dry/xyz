import { getPrisma } from "@/lib/prisma";

export type BlogSlugStats = {
  views: number;
  uniqueSessions: number;
  listenStarts: number;
  shareClicks: number;
};

type Row = {
  slug: string;
  views: bigint | number;
  unique_sessions: bigint | number;
  listen_starts: bigint | number;
  share_clicks: bigint | number;
};

function toNum(v: bigint | number): number {
  return typeof v === "bigint" ? Number(v) : v;
}

export async function fetchBlogEngagementStats(
  slugs: string[],
): Promise<Map<string, BlogSlugStats>> {
  const map = new Map<string, BlogSlugStats>();
  if (!slugs.length) {
    return map;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return map;
  }

  const slugSet = new Set(slugs);

  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT slug,
             COUNT(*) FILTER (WHERE event_name = 'page_view') AS views,
             COUNT(DISTINCT session_key) FILTER (WHERE event_name = 'page_view') AS unique_sessions,
             COUNT(*) FILTER (WHERE event_name = 'listen_start') AS listen_starts,
             COUNT(*) FILTER (WHERE event_name = 'share_click') AS share_clicks
      FROM blog_engagement_events
      GROUP BY slug
    `;

    for (const row of rows) {
      if (!slugSet.has(row.slug)) continue;
      map.set(row.slug, {
        views: toNum(row.views),
        uniqueSessions: toNum(row.unique_sessions),
        listenStarts: toNum(row.listen_starts),
        shareClicks: toNum(row.share_clicks),
      });
    }
  } catch {
    return map;
  }

  return map;
}
