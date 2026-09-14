import type { ReactNode } from "react";

import styles from "./legal-prose.module.css";

export function LegalProse({ children }: { children: ReactNode }) {
  return <div className={styles.prose}>{children}</div>;
}

export function LegalMeta({ children }: { children: ReactNode }) {
  return <p className={styles.meta}>{children}</p>;
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
