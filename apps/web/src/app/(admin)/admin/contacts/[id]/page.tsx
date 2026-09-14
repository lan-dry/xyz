import Link from "next/link";
import { notFound } from "next/navigation";

import { ContactAdminForm } from "@/components/admin/contact-admin-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { isAdminContactStatus } from "@/lib/admin/contact-status";
import { canWriteAdminContacts } from "@/lib/admin/roles";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

export default async function AdminContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await requireAdminPermissionSession("admin:contacts:read");
  const { id } = await params;
  const msg = await prisma.contactMessage.findUnique({ where: { id } });
  if (!msg) {
    notFound();
  }

  return (
    <article className="space-y-6">
      <AdminPageHeader
        title="Contact message"
        subtitle={`From ${msg.name} · ${msg.reason}`}
        actions={
          <Link
            href="/admin/contacts"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
          >
            All contacts
          </Link>
        }
      />

      <dl className="admin-surface grid gap-4 p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Created</dt>
          <dd className="mt-1 text-[var(--admin-fg)]">{msg.createdAt.toISOString()}</dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Status</dt>
          <dd className="mt-1">
            <span className="admin-token-badge">{msg.status}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Name</dt>
          <dd className="mt-1 text-[var(--admin-fg)]">{msg.name}</dd>
        </div>
        <div>
          <dt className="text-[var(--admin-fg-subtle)]">Email</dt>
          <dd className="mt-1">
            <a href={`mailto:${encodeURIComponent(msg.email)}`} className="text-[var(--admin-fg)]">
              {msg.email}
            </a>
          </dd>
        </div>
      </dl>

      <pre className="admin-surface whitespace-pre-wrap p-5 text-sm text-[var(--admin-fg)]">{msg.message}</pre>

      <ContactAdminForm
        id={msg.id}
        initialStatus={isAdminContactStatus(msg.status) ? msg.status : "new"}
        initialNotes={msg.adminNotes ?? ""}
        readOnly={!canWriteAdminContacts(role)}
      />
    </article>
  );
}
