import { FOUNDING_PRINCIPLES } from "@/lib/marketing-content";

import styles from "./about.module.css";

export function FoundingSidebar() {
  return (
    <aside className={styles.sidebar}>
      <p className="section-label">Principles</p>
      <ul className={styles.sidebarList}>
        {FOUNDING_PRINCIPLES.map((item) => (
          <li key={item.title} className={styles.sidebarItem}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
