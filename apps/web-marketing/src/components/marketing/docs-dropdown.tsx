"use client";

import { useEffect, useId, useRef } from "react";

import { docsUrl, type DocsProduct } from "@/lib/site-urls";

import nav from "./nav-link.module.css";
import styles from "./products-dropdown.module.css";

export type DocsNavItem = {
  product: DocsProduct;
  label: string;
  description: string;
};

type DocsDropdownProps = {
  items: readonly DocsNavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocsDropdown({ items, open, onOpenChange }: DocsDropdownProps) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        type="button"
        id={`${menuId}-button`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={`${menuId}-menu`}
        className={`${nav.link} ${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => onOpenChange(!open)}
      >
        Docs
        <Chevron open={open} />
      </button>
      <div
        id={`${menuId}-menu`}
        role="menu"
        aria-labelledby={`${menuId}-button`}
        className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
      >
        <ul className={styles.panelList}>
          {items.map((item) => (
            <li key={item.product} role="none">
              <a
                href={docsUrl(item.product)}
                role="menuitem"
                className={styles.panelLink}
                onClick={() => onOpenChange(false)}
              >
                <span className={styles.panelLinkTop}>
                  <span className={styles.panelLabel}>{item.label}</span>
                </span>
                <span className={styles.panelDesc}>{item.description}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
