"use client";

import { sendBlogEngagement } from "@/lib/blog/engagement-client";

import styles from "./blog.module.css";

export function BlogShare({
  slug,
  title,
  url,
}: {
  slug: string;
  title: string;
  url: string;
}) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copyLink = async () => {
    void sendBlogEngagement({ slug, event: "copy_link" });
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const onShare = (network: string) => {
    void sendBlogEngagement({ slug, event: "share_click", metadata: { network } });
  };

  return (
    <div className={styles.shareRow}>
      <a
        className={styles.shareBtn}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShare("linkedin")}
      >
        Share on LinkedIn
      </a>
      <a
        className={styles.shareBtn}
        href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShare("x")}
      >
        Share on X
      </a>
      <button type="button" className={styles.shareBtn} onClick={copyLink}>
        Copy link
      </button>
    </div>
  );
}
