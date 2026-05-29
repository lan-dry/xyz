import type { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Research",
};

export default async function ResearchPage() {
  const posts = await prisma.researchPost.findMany({
    where: { status: "published" },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Notes from the trust layer.</h1>
      <p className="mt-6 leading-relaxed text-ink/90">
        Technical research, essays, and lab notes. Long-form, slow, and citation-heavy - we publish when we have
        something we would defend in front of practitioners.{" "}
        <Link href="/research/feed.xml" className="text-teal no-underline hover:underline">
          RSS feed
        </Link>
      </p>

      {posts.length === 0 ? (
        <p className="mt-8 text-ink/70">Published posts will appear here.</p>
      ) : (
        <ul className="mt-10 space-y-6">
          {posts.map((post) => (
            <li key={post.id} className="border-b border-black/10 pb-6 last:border-0">
              <Link href={`/research/${post.slug}`} className="text-xl font-medium text-teal no-underline hover:underline">
                {post.title}
              </Link>
              <p className="mt-2 text-ink/85">{post.dek}</p>
              <p className="mt-2 text-sm text-ink/60">
                {post.publishedAt
                  ? `${post.publishedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
                  : "Date TBD"}{" "}
                · {post.readingMinutes} min read · {post.track}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
