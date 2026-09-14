import type { Metadata } from "next";
import Link from "next/link";

import { BlogCard } from "@/components/blog/blog-card";
import styles from "@/components/blog/blog.module.css";
import { listBlogPosts } from "@/lib/blog/store";
import { uniqueTags } from "@/lib/blog/utils";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights on governed automation, audit proof, and operational AI control for regulated finance.",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tag?: string }>;
};

export default async function BlogPage({ searchParams }: Props) {
  const { tag } = await searchParams;
  const activeTag = tag?.trim();
  const posts = await listBlogPosts({ status: "published", tag: activeTag });
  const allPosts = await listBlogPosts({ status: "published" });
  const tags = uniqueTags(allPosts);

  return (
    <>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className="section-label">Blog</p>
          <h1 className={styles.heroTitle}>Research & updates</h1>
          <p className={styles.heroLead}>
            Notes on governed automation, operational AI risk, and building controls banks and
            fintech teams can trust.
          </p>
          {tags.length > 0 ? (
            <div className={styles.filters}>
              <Link
                href="/blog"
                className={`${styles.filterChip} ${!activeTag ? styles.filterChipActive : ""}`}
              >
                All
              </Link>
              {tags.map((t) => (
                <Link
                  key={t}
                  href={`/blog?tag=${encodeURIComponent(t)}`}
                  className={`${styles.filterChip} ${
                    activeTag?.toLowerCase() === t.toLowerCase() ? styles.filterChipActive : ""
                  }`}
                >
                  {t}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.grid}>
        {posts.length === 0 ? (
          <div className={styles.empty}>
            <p>No articles yet. Check back soon.</p>
          </div>
        ) : (
          posts.map((post) => <BlogCard key={post.id} post={post} />)
        )}
      </div>
    </>
  );
}
