import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogCard } from "@/components/blog/blog-card";
import { BlogArticleEngagement } from "@/components/blog/blog-article-engagement";
import { BlogArticleListen } from "@/components/blog/blog-article-listen";
import { BlogAuthorSocial } from "@/components/blog/blog-author-social";
import { BlogShare } from "@/components/blog/blog-share";
import { BlogToc } from "@/components/blog/blog-toc";
import styles from "@/components/blog/blog.module.css";
import { resolveBlogAuthorDisplay } from "@/lib/blog/author-byline";
import { getBlogPostBySlug, isBlogPostLive, listBlogPosts } from "@/lib/blog/store";
import { extractTableOfContents, formatBlogDate } from "@/lib/blog/utils";
import { absoluteBlogOgImage } from "@/lib/blog/og-image";
import { SITE_ORIGIN } from "@/lib/site-origin";

export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  try {
    const { getPublishedBlogSlugs } = await import("@/lib/blog/store");
    const slugs = await getPublishedBlogSlugs();
    return slugs.map(({ slug }) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post || !isBlogPostLive(post)) {
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
  if (!post || !isBlogPostLive(post)) notFound();

  const toc = extractTableOfContents(post.contentHtml);
  const all = await listBlogPosts({ status: "published" });
  const related = all.filter((p) => p.slug !== post.slug).slice(0, 3);
  const articleUrl = `${SITE_ORIGIN}/blog/${post.slug}`;
  const author = await resolveBlogAuthorDisplay(post);
  const initials = author.name
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
            <Link href="/blog" className="page-nav-link">
              All articles
            </Link>

            <header className={styles.articleHeader}>
              {post.tags.length > 0 ? (
                <div className={styles.cardTags} style={{ marginBottom: "1rem" }}>
                  {post.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <h1 className={styles.articleTitle}>{post.title}</h1>
              {post.excerpt ? <p className={styles.articleExcerpt}>{post.excerpt}</p> : null}
              <div className={styles.articleMetaRow}>
                <span>{formatBlogDate(post.publishedAt ?? post.createdAt)}</span>
                <span>{post.readingTimeMinutes} min read</span>
              </div>
              <aside className={styles.authorCard}>
                {author.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.photoUrl} alt="" className={styles.authorAvatarImg} />
                ) : (
                  <div className={styles.authorAvatar} aria-hidden>
                    {initials}
                  </div>
                )}
                <div>
                  <p className={styles.authorName}>{author.name}</p>
                  {author.role ? <p className={styles.authorRole}>{author.role}</p> : null}
                  {author.bio ? <p className={styles.authorBio}>{author.bio}</p> : null}
                  <BlogAuthorSocial
                    linkedinUrl={author.linkedinUrl}
                    xUrl={author.xUrl}
                    instagramUrl={author.instagramUrl}
                  />
                </div>
              </aside>
            </header>

            {post.coverImageUrl ? (
              <div className={styles.coverHero}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.coverImageUrl} alt="" />
              </div>
            ) : null}

            <BlogArticleEngagement slug={post.slug} />
            <BlogArticleListen
              slug={post.slug}
              title={post.title}
              contentHtml={post.contentHtml}
            />
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
