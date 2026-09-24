import Link from "next/link";

import { resolveBlogCoverUrl } from "@/lib/blog/default-cover";
import type { BlogPostListItem } from "@/lib/blog/types";
import { formatBlogDate } from "@/lib/blog/utils";

import styles from "./blog.module.css";

export function BlogCard({ post }: { post: BlogPostListItem }) {
  return (
    <Link href={`/blog/${post.slug}`} className={styles.card}>
      <div className={styles.cardCover}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveBlogCoverUrl(post.coverImageUrl)} alt="" />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          <span>{formatBlogDate(post.publishedAt ?? post.createdAt)}</span>
          <span>{post.readingTimeMinutes} min read</span>
        </div>
        <h2 className={styles.cardTitle}>{post.title}</h2>
        <p className={styles.cardExcerpt}>{post.excerpt}</p>
        {post.tags.length > 0 ? (
          <div className={styles.cardTags}>
            {post.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
