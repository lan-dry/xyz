import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await prisma.researchPost.findFirst({
    where: { slug, status: "published" },
    select: { title: true, dek: true, ogImageUrl: true },
  });
  if (!post) return { title: "Research" };
  return {
    title: post.title,
    description: post.dek,
    openGraph: {
      title: post.title,
      description: post.dek,
      ...(post.ogImageUrl ? { images: [{ url: post.ogImageUrl }] } : {}),
    },
  };
}

export default async function ResearchPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await prisma.researchPost.findFirst({
    where: { slug, status: "published" },
    include: { author: true },
  });

  if (!post) {
    notFound();
  }

  const blocks = post.body.split(/\n\n+/).filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <p className="text-sm">
        <Link href="/research" className="text-teal no-underline hover:underline">
          ← Research
        </Link>
      </p>
      <article className="mt-6">
        <h1 className="text-3xl font-semibold text-ink">{post.title}</h1>
        <p className="mt-4 text-lg text-ink/85">{post.dek}</p>
        <p className="mt-4 text-sm text-ink/60">
          {post.publishedAt
            ? post.publishedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
            : null}
          {post.author ? ` · ${post.author.name}` : null}
          {` · ${post.readingMinutes} min`}
        </p>
        <div className="mt-10 space-y-4 leading-relaxed text-ink/90">
          {blocks.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>
    </div>
  );
}
