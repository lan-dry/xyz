import type { Metadata } from "next";

import { BlogCard } from "@/components/blog/blog-card";
import styles from "@/components/blog/blog.module.css";
import { listBlogPosts } from "@/lib/blog/store";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Insights on governed automation, audit proof, and operational AI control for regulated finance.",
};

export const revalidate = 300;

export default async function BlogPage() {
  const posts = await listBlogPosts({ status: "published" });

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
