import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogCard } from "@/components/blog/blog-card";
import { BlogProse } from "@/components/blog/blog-prose";
import { BlogArticleEngagement } from "@/components/blog/blog-article-engagement";
import { BlogListen } from "@/components/blog/blog-listen";
import { BlogShare } from "@/components/blog/blog-share";
import { BlogToc } from "@/components/blog/blog-toc";
import styles from "@/components/blog/blog.module.css";
import { getBlogPostBySlug, listBlogPosts } from "@/lib/blog/store";
import { extractTableOfContents, formatBlogDate } from "@/lib/blog/utils";
import { resolveBlogCoverUrl } from "@/lib/blog/default-cover";
import { absoluteBlogOgImage } from "@/lib/blog/og-image";
import { SITE_ORIGIN } from "@/lib/site-origin";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const { getPublishedBlogSlugs } = await import("@/lib/blog/store");
  const slugs = await getPublishedBlogSlugs();
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post || post.status !== "published") {
    return { title: "Article not found" };
  }
  const ogImage = absoluteBlogOgImage(post.coverImageUrl);
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.excerpt;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      url: `${SITE_ORIGIN}/blog/${post.slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function BlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post || post.status !== "published") notFound();

  const toc = extractTableOfContents(post.contentHtml);
  const all = await listBlogPosts({ status: "published" });
  const related = all.filter((p) => p.slug !== post.slug).slice(0, 3);
  const articleUrl = `${SITE_ORIGIN}/blog/${post.slug}`;
  const initials = post.authorName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className={styles.articleShell}>
      <div className={styles.articleWide}>
        <div>
          <div className={styles.articleInner} style={{ padding: 0, maxWidth: "none" }}>
            <Link href="/blog" className={styles.backLink}>
              ← All articles
            </Link>

            <header className={styles.articleHeader}>
              {post.tags.length > 0 ? (
                <div className={styles.cardTags} style={{ marginBottom: "1rem" }}>
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/blog?tag=${encodeURIComponent(tag)}`}
                      className={styles.tag}
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              ) : null}
              <h1 className={styles.articleTitle}>{post.title}</h1>
              {post.excerpt ? <p className={styles.articleExcerpt}>{post.excerpt}</p> : null}
              <div className={styles.articleMetaRow}>
                <div className={styles.authorBlock}>
                  <div className={styles.authorAvatar}>{initials}</div>
                  <div>
                    <span className={styles.authorName}>{post.authorName}</span>
                    {post.authorRole ? (
                      <span className={styles.authorRole}>{post.authorRole}</span>
                    ) : null}
                  </div>
                </div>
                <span>{formatBlogDate(post.publishedAt ?? post.createdAt)}</span>
                <span>{post.readingTimeMinutes} min read</span>
              </div>
            </header>

            {post.coverImageUrl ? (
              <div className={styles.coverHero}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.coverImageUrl} alt="" />
              </div>
            ) : null}

            <BlogArticleEngagement slug={post.slug} />
            <BlogListen slug={post.slug} title={post.title} contentHtml={post.contentHtml} />
            <BlogProse html={post.contentHtml} />
            <BlogShare slug={post.slug} title={post.title} url={articleUrl} />

            {related.length > 0 ? (
              <section className={styles.related}>
                <h2 className={styles.relatedTitle}>More from Salanor</h2>
                <div className={styles.relatedGrid}>
                  {related.map((item) => (
                    <BlogCard key={item.id} post={item} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <BlogToc items={toc} />
      </div>
    </article>
  );
}
