import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./empty-state-panel.module.css";

export function EmptyStatePanel({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.iconWrap} aria-hidden>
        <Icon className={styles.icon} strokeWidth={1.25} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}
