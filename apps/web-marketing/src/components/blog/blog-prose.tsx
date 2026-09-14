import { injectHeadingIds } from "@/lib/blog/utils";

import styles from "./blog.module.css";

export function BlogProse({ html }: { html: string }) {
  const withIds = injectHeadingIds(html);
  return (
    <div
      className={styles.prose}
      dangerouslySetInnerHTML={{ __html: withIds }}
    />
  );
}
