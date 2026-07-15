"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import styles from "./nav-link.module.css";

function isActive(pathname: string, href: string): boolean {
  if (href.startsWith("/#")) return false;
  if (href === "/") return pathname === "/";
  const path = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const target = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;
  return path === target || path.startsWith(`${target}/`);
}

export function NavTextLink({
  href,
  children,
  external,
  className = "",
  onClick,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  const cls = `${styles.link} ${className}`.trim();

  if (external) {
    return (
      <a
        href={href}
        className={cls}
        data-current={active ? "true" : "false"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      className={cls}
      data-current={active ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
