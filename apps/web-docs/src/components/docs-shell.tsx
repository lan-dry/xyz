import Link from "next/link";

import { DocsExternalLink } from "@/components/docs-external-link";
import { DocsSearch } from "@/components/docs-search";
import { OnThisPage } from "@/components/on-this-page";
import { getAegisBreadcrumbs } from "@/lib/breadcrumbs";
import { aegisNav, type NavItem } from "@/lib/navigation";
import { DOCS } from "@/lib/site";

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    pathname === item.href ||
    (item.href !== "/aegis" && pathname.startsWith(`${item.href}/`));
  const childActive = item.children?.some((c) => pathname === c.href);

  return (
    <div className="nav-group">
      <Link
        href={item.href}
        className={active || childActive ? "nav-link active" : "nav-link"}
      >
        {item.title}
      </Link>
      {item.children ? (
        <div className="nav-children">
          {item.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={pathname === child.href ? "nav-sublink active" : "nav-sublink"}
            >
              {child.title}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DocsShell({
  children,
  pathname,
}: {
  children: React.ReactNode;
  pathname: string;
}) {
  const crumbs = getAegisBreadcrumbs(pathname);

  return (
    <div className="docs-root">
      <header className="docs-header">
        <div className="docs-header-inner">
          <Link href="/aegis" className="docs-brand">
            Salanor Docs
          </Link>
          <span className="docs-header-meta">Aegis · APS-1</span>
          <nav className="docs-header-links" aria-label="External">
            <DocsExternalLink href={DOCS.marketingUrl}>salanor.com</DocsExternalLink>
            <DocsExternalLink href={DOCS.consoleUrl}>Console</DocsExternalLink>
          </nav>
        </div>
      </header>
      <div className="docs-body">
        <aside className="docs-sidebar">
          <DocsSearch />
          <p className="sidebar-label">Integrate Aegis</p>
          {aegisNav.map((item) => (
            <NavGroup key={item.href} item={item} pathname={pathname} />
          ))}
        </aside>
        <article className="docs-content docs-article">
          <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={`${c.href}-${i}`} className="crumb-item">
                {i > 0 ? <span className="crumb-sep">/</span> : null}
                {i < crumbs.length - 1 ? (
                  <Link href={c.href}>{c.title}</Link>
                ) : (
                  <span className="crumb-current">{c.title}</span>
                )}
              </span>
            ))}
          </nav>
          {children}
        </article>
        <OnThisPage />
      </div>
    </div>
  );
}
