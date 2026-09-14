"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import nav from "./nav-link.module.css";
import styles from "./products-dropdown.module.css";

export type ProductNavItem = {
  href: string;
  label: string;
  description: string;
  badge?: string;
};

type ProductsDropdownProps = {
  items: readonly ProductNavItem[];
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

function ProductsPanel({
  id,
  labelledBy,
  open,
  items,
  onNavigate,
}: {
  id: string;
  labelledBy: string;
  open: boolean;
  items: readonly ProductNavItem[];
  onNavigate: () => void;
}) {
  return (
    <div
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
    >
      <ul className={styles.panelList}>
        {items.map((item) => (
          <li key={item.href} role="none">
            <Link href={item.href} role="menuitem" className={styles.panelLink} onClick={onNavigate}>
              <span className={styles.panelLinkTop}>
                <span className={styles.panelLabel}>{item.label}</span>
                {item.badge ? <span className={styles.panelBadge}>{item.badge}</span> : null}
              </span>
              <span className={styles.panelDesc}>{item.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProductsDropdown({ items, open, onOpenChange }: ProductsDropdownProps) {
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
        Products
        <Chevron open={open} />
      </button>
      <ProductsPanel
        id={`${menuId}-menu`}
        labelledBy={`${menuId}-button`}
        open={open}
        items={items}
        onNavigate={() => onOpenChange(false)}
      />
    </div>
  );
}
