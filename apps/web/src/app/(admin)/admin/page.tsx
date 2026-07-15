import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboardPage() {
  const [newContacts, drafts, openRoles, organizations, users] = await Promise.all([
    prisma.contactMessage.count({ where: { status: "new" } }),
    prisma.researchPost.count({ where: { status: "draft" } }),
    prisma.openRole.count({ where: { status: "open" } }),
    prisma.organization.count(),
    prisma.user.count(),
  ]);

  const cards = [
    { label: "New contacts", value: newContacts, href: "/admin/contacts?status=new" },
    { label: "Research drafts", value: drafts, href: "/admin/research" },
    { label: "Open roles", value: openRoles, href: "/admin/careers" },
    { label: "Organizations", value: organizations, href: "/admin/organizations" },
    { label: "Users", value: users, href: "/admin/users" },
  ];

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Dashboard"
        subtitle="Internal operations overview across inbound, content, and tenants."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="admin-surface block p-5 no-underline transition-colors duration-150 hover:bg-[var(--admin-surface-hover)]"
          >
            <p className="text-sm text-[var(--admin-fg-subtle)]">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--admin-fg)]">{card.value}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
