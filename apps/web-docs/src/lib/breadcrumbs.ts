import { aegisNav, type NavItem } from "./navigation";

export type Breadcrumb = { title: string; href: string };

function walk(
  items: NavItem[],
  pathname: string,
  trail: Breadcrumb[],
): Breadcrumb[] | null {
  for (const item of items) {
    const next = [...trail, { title: item.title, href: item.href }];
    if (pathname === item.href) {
      return next;
    }
    if (item.children) {
      const child = walk(item.children, pathname, next);
      if (child) return child;
    }
    if (pathname.startsWith(`${item.href}/`) && item.href !== "/aegis") {
      const leaf = pathname.split("/").filter(Boolean).pop();
      const pretty = leaf?.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      if (pretty && !item.children?.some((c) => c.href === pathname)) {
        return [...next, { title: pretty, href: pathname }];
      }
    }
  }
  return null;
}

/** Breadcrumb trail for current docs path (Aegis section). */
export function getAegisBreadcrumbs(pathname: string): Breadcrumb[] {
  const trail = walk(aegisNav, pathname, []);
  if (!trail?.length) {
    return [{ title: "Aegis", href: "/aegis" }];
  }
  if (pathname === "/aegis") {
    return [{ title: "Aegis", href: "/aegis" }];
  }
  const rest = trail[0]?.href === "/aegis" ? trail.slice(1) : trail;
  return [{ title: "Aegis", href: "/aegis" }, ...rest];
}

export function getPageTitle(pathname: string): string {
  const crumbs = getAegisBreadcrumbs(pathname);
  return crumbs[crumbs.length - 1]?.title ?? "Documentation";
}
