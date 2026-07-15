import { COMPANY_PRINCIPLES } from "@/lib/marketing-content";

import { ScrollReveal } from "../scroll-reveal";
import styles from "./about.module.css";

export function AboutPrinciplesGrid() {
  return (
    <section className={styles.principlesSection}>
      <ScrollReveal>
        <div className={styles.principlesInner}>
          <header className={styles.principlesHeader}>
            <p className="section-label">Principles</p>
            <h2>How we decide what ships</h2>
          </header>
          <ul className={styles.principlesGrid}>
            {COMPANY_PRINCIPLES.map((item) => (
              <li key={item.title} className={styles.principleCard}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </ScrollReveal>
    </section>
  );
}
