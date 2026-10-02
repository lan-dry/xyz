import Link from "next/link";

import styles from "@/components/blog/blog.module.css";
import { resolveBlogCoverUrl } from "@/lib/blog/default-cover";
import { formatBlogDate } from "@/lib/blog/utils";

export type ResearchListItem = {
  slug: string;
  title: string;
  dek: string;
  track: string;
  readingMinutes: number;
  publishedAt: string | null;
  heroImageUrl: string | null;
};

function trackLabel(track: string): string {
  return track.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ResearchCard({ post }: { post: ResearchListItem }) {
  const slug = post.slug.trim().toLowerCase();
  const date = post.publishedAt ? formatBlogDate(post.publishedAt) : null;

  return (
    <Link href={`/research/${slug}`} className={styles.card}>
      <div className={styles.cardCover}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolveBlogCoverUrl(post.heroImageUrl)} alt="" />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>
          {date ? <span>{date}</span> : null}
          <span>{trackLabel(post.track)}</span>
          <span>{post.readingMinutes} min read</span>
        </div>
        <h2 className={styles.cardTitle}>{post.title}</h2>
        <p className={styles.cardExcerpt}>{post.dek}</p>
      </div>
    </Link>
  );
}
