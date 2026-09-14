import Link from "next/link";

import styles from "./about.module.css";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/about/founding", label: "The founding note" },
] as const;

function isCurrent(href: string, page: "about" | "founding") {
  return page === "founding" ? href === "/about/founding" : href === "/about";
}

export function AboutSubnav({ current }: { current: "about" | "founding" }) {
  return (
    <nav className={styles.subnav} aria-label="About">
      {LINKS.map((link, i) => (
        <span key={link.href} className={styles.subnavItem}>
          {i > 0 ? <span className={styles.subnavSep} aria-hidden>·</span> : null}
          {isCurrent(link.href, current) ? (
            <span className={styles.subnavCurrent}>{link.label}</span>
          ) : (
            <Link href={link.href}>{link.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
