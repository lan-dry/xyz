import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = process.env.AUTH_URL?.replace(/\/$/, "") ?? "https://salanor.com";
  const posts = await prisma.researchPost.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  const items = posts
    .map((post) => {
      const link = `${base}/research/${post.slug}`;
      const pubDate = post.publishedAt?.toUTCString() ?? new Date().toUTCString();
      return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(link)}</link>
  <guid isPermaLink="true">${escapeXml(link)}</guid>
  <description>${escapeXml(post.dek)}</description>
  <pubDate>${pubDate}</pubDate>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Salanor Research</title>
  <link>${escapeXml(`${base}/research`)}</link>
  <description>Notes from the trust layer.</description>
  <language>en-us</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
