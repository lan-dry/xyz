import Link from "next/link";
import type { ReactNode } from "react";

import { ScrollReveal } from "./scroll-reveal";
import styles from "./marketing-page.module.css";

export function MarketingPage({
  label,
  title,
  lead,
  children,
  layout = "narrow",
  backHref = "/",
  prefix,
}: {
  label: string;
  title: string;
  lead?: string;
  children: ReactNode;
  layout?: "narrow" | "wide";
  backHref?: string;
  prefix?: ReactNode;
}) {
  const innerClass =
    layout === "wide" ? styles.inner : `${styles.inner} ${styles.narrow}`;

  return (
    <section className={styles.page}>
      <ScrollReveal>
        <div className={innerClass}>
          {prefix}
          <p className="section-label">{label}</p>
          <h1 className={styles.title}>{title}</h1>
          {lead ? <p className={styles.lead}>{lead}</p> : null}
          <div className={styles.body}>{children}</div>
          <Link href={backHref} className={styles.back}>
            ← Back to home
          </Link>
        </div>
      </ScrollReveal>
    </section>
  );
}
