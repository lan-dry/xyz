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
  let label = status;
  if (s === "active" || s === "completed" || s === "allow" || s === "ok") {
    className = ui.badgeSuccess;
    if (s === "allow") label = "Allowed";
    if (s === "completed") label = "Completed";
  } else if (
    s === "blocked" ||
    s === "pending" ||
    s === "draft" ||
    s === "allow_with_obligation"
  ) {
    className = ui.badgeWarning;
    if (s === "allow_with_obligation" || s === "blocked" || s === "pending") {
      label = "Ask a person";
    }
  } else if (s === "executing" || s === "running") {
    className = ui.badgeDefault;
    label = "Running";
  } else if (
    s === "deny" ||
    s === "revoked" ||
    s === "failed" ||
    s === "rejected" ||
    s === "expired" ||
    s === "suspended"
  ) {
    className = ui.badgeDanger;
    if (s === "deny") label = "Stopped";
    if (s === "rejected") label = "Declined";
  } else if (s === "approved") {
    className = ui.badgeSuccess;
    label = "Approved";
  }
  return <span className={`${ui.badge} ${className}`}>{label}</span>;
}

/** Plain-language outcome chip (Allow / Stop / Ask a person). */
export function OutcomeChip({
  chip,
  kind,
}: {
  chip: string;
  kind: string;
}) {
  const k = kind.toLowerCase();
  let className = ui.badgeMuted;
  if (k === "allow" || k === "approved") className = ui.badgeSuccess;
  else if (k === "ask_person" || k === "running") className = ui.badgeWarning;
  else if (
    k === "stop" ||
    k === "declined" ||
    k === "expired" ||
    k === "failed"
  ) {
    className = ui.badgeDanger;
  }
  return <span className={`${ui.badge} ${className}`}>{chip}</span>;
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
