import Link from "next/link";

import { SALANOR_STACK } from "@/lib/marketing-content";

import styles from "./company-stack.module.css";

export function CompanyStack({ highlight }: { highlight?: "aegis" | "aether" }) {
  return (
    <div className={styles.stack} role="list" aria-label="Salanor platform">
      {SALANOR_STACK.map((layer) => {
        const isHighlight =
          highlight && "slug" in layer && layer.slug === highlight;
        const inner = (
          <>
            <div className={styles.rowHead}>
              <span className={styles.name}>{layer.name}</span>
              {"status" in layer && layer.status ? (
                <span className={styles.status}>{layer.status}</span>
              ) : null}
            </div>
            <span className={styles.role}>{layer.role}</span>
            <p className={styles.desc}>{layer.description}</p>
          </>
        );

        return (
          <div
            key={layer.name}
            role="listitem"
            className={`${styles.layer} ${isHighlight ? styles.layerActive : ""} ${
              layer.name === "Salanor" ? styles.layerRoot : ""
            }`}
          >
            {"href" in layer && layer.href ? (
              <Link href={layer.href} className={styles.layerLink}>
                {inner}
              </Link>
            ) : (
              <div className={styles.layerBody}>{inner}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
