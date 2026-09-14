"use client";

import type { TocItem } from "@/lib/blog/utils";

import styles from "./blog.module.css";

export function BlogToc({ items }: { items: TocItem[] }) {
  if (items.length < 2) return null;

  return (
    <aside className={styles.tocAside}>
      <p className={styles.tocTitle}>On this page</p>
      <ul className={styles.tocList}>
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`${styles.tocLink} ${item.level === 3 ? styles.tocLinkL3 : ""}`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
