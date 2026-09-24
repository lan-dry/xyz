import type { InternalRole } from "./roles";
import { hasAdminPermission } from "./roles";

export type AdminNavItem = {
  href: string;
  label: string;
  visible: boolean;
  external?: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

function opsUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_PLATFORM_URL?.trim() || "http://localhost:3003").replace(
    /\/$/,
    "",
  );
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** @deprecated Staff CMS moved to Platform Ops (ops.salanor.com). This nav deep-links there. */
export function adminNavGroupsForRole(role: InternalRole): AdminNavGroup[] {
  const canContacts = hasAdminPermission(role, "admin:contacts:read");
  const canCms = hasAdminPermission(role, "admin:cms:read");
  const canTenants = hasAdminPermission(role, "admin:tenants:read");
  const canInternalUsers = hasAdminPermission(role, "admin:internal-users:manage");

  return [
    {
      label: "Overview",
      items: [{ href: "/admin", label: "Dashboard", visible: true }],
    },
    {
      label: "Content (Platform Ops)",
      items: [
        {
          href: opsUrl("/content/leads"),
          label: "Leads",
          visible: canContacts || canCms,
          external: true,
        },
        { href: opsUrl("/content/blog"), label: "Blog", visible: canCms, external: true },
        { href: opsUrl("/content/research"), label: "Research", visible: canCms, external: true },
        { href: opsUrl("/content/careers"), label: "Careers", visible: canCms, external: true },
      ],
    },
    {
      label: "Tenants (Platform Ops)",
      items: [
        {
          href: opsUrl("/organizations"),
          label: "Organizations",
          visible: canTenants,
          external: true,
        },
        { href: opsUrl("/accounts"), label: "Accounts", visible: canTenants, external: true },
      ],
    },
    {
      label: "Platform",
      items: [
        {
          href: opsUrl("/team"),
          label: "Platform team",
          visible: canInternalUsers,
          external: true,
        },
        { href: "/admin/internal-users", label: "Internal users (legacy)", visible: canInternalUsers },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);
}
