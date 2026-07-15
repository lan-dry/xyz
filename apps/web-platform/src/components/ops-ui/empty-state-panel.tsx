import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./empty-state-panel.module.css";

export function EmptyStatePanel({
  icon: Icon,
  title,
  description,
  action,
  secondary,
}: {
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className={styles.panel}>
      <div className={styles.iconWrap} aria-hidden>
        {Icon ? <Icon className={styles.icon} strokeWidth={1.25} /> : null}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {action ? <div className={styles.actions}>{action}</div> : null}
      {secondary ? <div className={styles.secondary}>{secondary}</div> : null}
    </div>
  );
}
