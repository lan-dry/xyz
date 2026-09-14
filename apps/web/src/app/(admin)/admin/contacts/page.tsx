import Link from "next/link";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminDataTable, AdminTableHead, AdminTableRow, AdminTd, AdminTh } from "@/components/admin/admin-data-table";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_CONTACT_STATUSES, isAdminContactStatus } from "@/lib/admin/contact-status";
import { requireAdminPermissionSession } from "@/lib/admin/require-admin";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminContactsPage({ searchParams }: Props) {
  await requireAdminPermissionSession("admin:contacts:read");
  const params = await searchParams;
  const selected = isAdminContactStatus(params.status ?? "") ? params.status : "new";

  const [messages, counts] = await Promise.all([
    prisma.contactMessage.findMany({
      where: { status: selected },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.contactMessage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map(counts.map((row) => [row.status, row._count._all]));

  return (
    <section className="space-y-6">
      <AdminPageHeader
        title="Contacts"
        subtitle="Inbound messages from marketing and product forms."
      />

      <div className="admin-toolbar">
        {ADMIN_CONTACT_STATUSES.map((status) => {
          const active = status === selected;
          return (
            <Link
              key={status}
              href={`/admin/contacts?status=${status}`}
              className={`inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium no-underline transition-colors duration-150 ${
                active
                  ? "border-ink bg-ink !text-white"
                  : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-fg)] hover:bg-[var(--admin-surface-hover)]"
              }`}
            >
              {status} ({countMap.get(status) ?? 0})
            </Link>
          );
        })}
      </div>

      {messages.length === 0 ? (
        <AdminEmptyState
          title="No messages in this queue"
          description={`There are no contact messages with status “${selected}”. Try another filter or check back later.`}
        />
      ) : (
        <AdminDataTable>
          <AdminTableHead>
            <tr>
              <AdminTh>Created</AdminTh>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Reason</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh className="text-right"> </AdminTh>
            </tr>
          </AdminTableHead>
          <tbody>
            {messages.map((m) => (
              <AdminTableRow key={m.id}>
                <AdminTd className="text-[var(--admin-fg-subtle)]">
                  {m.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                </AdminTd>
                <AdminTd className="font-medium text-[var(--admin-fg)]">{m.name}</AdminTd>
                <AdminTd>
                  <a href={`mailto:${encodeURIComponent(m.email)}`} className="text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]">
                    {m.email}
                  </a>
                </AdminTd>
                <AdminTd className="text-[var(--admin-fg-muted)]">{m.reason}</AdminTd>
                <AdminTd>
                  <span className="admin-token-badge">{m.status}</span>
                </AdminTd>
                <AdminTd className="text-right">
                  <Link
                    href={`/admin/contacts/${m.id}`}
                    className="inline-flex h-8 items-center rounded-lg border border-[var(--admin-border)] px-3 text-sm font-medium text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]"
                  >
                    Open
                  </Link>
                </AdminTd>
              </AdminTableRow>
            ))}
          </tbody>
        </AdminDataTable>
      )}
    </section>
  );
}
