import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BlogAuthorSocial } from "@/components/blog/blog-author-social";
import { BlogProse } from "@/components/blog/blog-prose";
import { BlogToc } from "@/components/blog/blog-toc";
import styles from "@/components/blog/blog.module.css";
import { getPublishedResearchBySlug } from "@/lib/cms/research-store";
import { extractTableOfContents, formatBlogDate } from "@/lib/blog/utils";
import { SITE_ORIGIN } from "@/lib/site-origin";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedResearchBySlug(slug);
  if (!post) return { title: "Research not found" };
  const og = post.ogImageUrl ?? post.heroImageUrl;
  return {
    title: post.title,
    description: post.dek,
    openGraph: {
      title: post.title,
      description: post.dek,
      type: "article",
      url: `${SITE_ORIGIN}/research/${post.slug}`,
      images: og ? [{ url: og.startsWith("http") ? og : `${SITE_ORIGIN}${og}` }] : undefined,
    },
  };
}

export const revalidate = 120;

function trackLabel(track: string): string {
  return track.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function ResearchArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedResearchBySlug(slug);
  if (!post) notFound();

  const canonical = post.slug.trim().toLowerCase();
  if (slug.trim().toLowerCase() !== canonical || slug !== canonical) {
    redirect(`/research/${canonical}`);
  }

  const toc = extractTableOfContents(post.bodyHtml);
  const date = post.publishedAt ? formatBlogDate(post.publishedAt) : null;

  return (
    <article className={styles.articleShell}>
      {post.heroImageUrl ? (
        <div className={styles.articleHeroBand}>
          <div className={styles.coverHeroWide}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.heroImageUrl} alt="" />
          </div>
        </div>
      ) : null}

      <div className={styles.articleWide}>
        <div>
          <div className={styles.articleInner} style={{ padding: 0, maxWidth: "none" }}>
            <Link href="/research" className="page-nav-link">
              All research
            </Link>

            <header className={styles.articleHeader}>
              <p className={styles.cardMeta}>
                {trackLabel(post.track)} · {post.readingMinutes} min read
                {date ? ` · ${date}` : ""}
              </p>
              <h1 className={styles.articleTitle}>{post.title}</h1>
              <p className={styles.articleExcerpt}>{post.dek}</p>
              {post.authorName ? (
                <div className={styles.articleMetaRow}>
                  <div className={styles.authorBlock}>
                    {post.authorPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.authorPhotoUrl} alt="" className={styles.authorAvatarImg} />
                    ) : (
                      <div className={styles.authorAvatar}>
                        {post.authorName
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}
                    <div>
                      <span className={styles.authorName}>{post.authorName}</span>
                      {post.authorRole ? (
                        <span className={styles.authorRole}>{post.authorRole}</span>
                      ) : null}
                      <BlogAuthorSocial
                        linkedinUrl={post.authorLinkedinUrl}
                        xUrl={post.authorXUrl}
                        instagramUrl={post.authorInstagramUrl}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </header>

            <BlogProse html={post.bodyHtml} />
          </div>
        </div>

        <BlogToc items={toc} />
      </div>
    </article>
  );
}
