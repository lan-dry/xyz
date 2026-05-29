import Link from "next/link";
import type { ReactNode } from "react";

import ui from "./ui.module.css";

export function ConsolePage({ children }: { children: ReactNode }) {
  return <div className={ui.page}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={ui.pageHeader}>
      <h1 className={ui.pageTitle}>{title}</h1>
      {subtitle ? <p className={ui.pageSubtitle}>{subtitle}</p> : null}
      {actions ? <div className={ui.pageActions}>{actions}</div> : null}
    </header>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={ui.backLink}>
      {children}
    </Link>
  );
}

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const s = status.toLowerCase();
  let className = ui.badgeMuted;
  if (s === "active" || s === "completed" || s === "allow" || s === "ok") {
    className = ui.badgeSuccess;
  } else if (s === "blocked" || s === "pending" || s === "draft") {
    className = ui.badgeWarning;
  } else if (s === "deny" || s === "revoked" || s === "failed" || s === "rejected") {
    className = ui.badgeDanger;
  }
  return <span className={`${ui.badge} ${className}`}>{status}</span>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className={ui.empty}>
      <p className={ui.emptyTitle}>{title}</p>
      {description ? <p style={{ margin: 0 }}>{description}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return <p className={ui.loading}>{label}</p>;
}

export function ErrorAlert({ message }: { message: string }) {
  return <div className={`${ui.alert} ${ui.alertError}`}>{message}</div>;
}

export { ConsolePagination } from "./console-pagination";
export { SidePanel } from "./side-panel";
export { EmptyStatePanel } from "./empty-state-panel";
export { Modal } from "./modal";
export { ui };
