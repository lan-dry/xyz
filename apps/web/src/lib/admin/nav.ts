import type { InternalRole } from "./roles";
import { hasAdminPermission } from "./roles";

export type AdminNavItem = {
  href: string;
  label: string;
  visible: boolean;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

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
      label: "Inbound",
      items: [{ href: "/admin/contacts", label: "Contacts", visible: canContacts }],
    },
    {
      label: "Content",
      items: [
        { href: "/admin/research", label: "Research", visible: canCms },
        { href: "/admin/careers", label: "Careers", visible: canCms },
      ],
    },
    {
      label: "Tenants",
      items: [
        { href: "/admin/organizations", label: "Organizations", visible: canTenants },
        { href: "/admin/users", label: "Users", visible: canTenants },
      ],
    },
    {
      label: "Platform",
      items: [{ href: "/admin/internal-users", label: "Internal users", visible: canInternalUsers }],
    },
  ].map((group) => ({
    ...group,
    items: group.items.filter((item) => item.visible),
  })).filter((group) => group.items.length > 0);
}
