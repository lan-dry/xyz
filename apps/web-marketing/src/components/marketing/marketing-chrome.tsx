import type { ReactNode } from "react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./marketing-chrome.module.css";

export function MarketingChrome({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell} data-marketing-shell>
      <SiteHeader />
      <main className={styles.main}>{children}</main>
      <SiteFooter />
    </div>
  );
}
