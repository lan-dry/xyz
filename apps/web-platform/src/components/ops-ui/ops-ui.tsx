import Link from "next/link";
import type { ReactNode } from "react";

import ui from "./ui.module.css";

export function OpsPage({ children }: { children: ReactNode }) {
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

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return <p className={ui.loading}>{label}</p>;
}

export function ErrorAlert({ message }: { message: string }) {
  return <div className={`${ui.alert} ${ui.alertError}`}>{message}</div>;
}

export { EmptyStatePanel } from "./empty-state-panel";
export { OpsBackLink } from "./ops-back-link";
export { ui };
