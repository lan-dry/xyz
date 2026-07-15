import { readFile } from "node:fs/promises";

import type pg from "pg";

import { contactMessagesFile, legacyContactMessageFiles } from "./contact-data-dir.js";

export type LeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";

export type ContactLeadRow = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  sourcePath: string;
  status: LeadStatus;
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ListContactLeadsParams = {
  limit: number;
  offset: number;
  q?: string;
  reason?: string;
  status?: LeadStatus;
};

export type ListContactLeadsResult = {
  leads: ContactLeadRow[];
  total: number;
  limit: number;
  offset: number;
  stats: { total: number; new: number; week: number };
  source: string;
};

type DbRow = {
  id: string;
  created_at: Date;
  updated_at: Date;
  name: string;
  email: string;
  organization: string | null;
  role: string | null;
  reason: string;
  message: string;
  source_path: string;
  status: string;
  admin_notes: string | null;
  updated_by: string | null;
};

function mapRow(row: DbRow): ContactLeadRow {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    name: row.name,
    email: row.email,
    organization: row.organization,
    role: row.role,
    reason: row.reason,
    message: row.message,
    sourcePath: row.source_path,
    status: (row.status as LeadStatus) || "new",
    notes: row.admin_notes ?? "",
    updatedAt: row.updated_at?.toISOString() ?? null,
    updatedBy: row.updated_by,
  };
}

export async function importLegacyJsonlIfEmpty(pool: pg.Pool): Promise<void> {
  const count = await pool.query<{ n: string }>("SELECT COUNT(*)::text AS n FROM contact_messages");
  if (Number(count.rows[0]?.n ?? 0) > 0) return;

  const files = [
    contactMessagesFile(),
    ...legacyContactMessageFiles().filter((p) => p !== contactMessagesFile()),
  ];

  for (const file of files) {
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as {
          id: string;
          createdAt: string;
          name: string;
          email: string;
          organization?: string | null;
          role?: string | null;
          reason: string;
          message: string;
          sourcePath: string;
          ipHash: string;
        };
        if (!row.id || !row.email) continue;
        await pool.query(
          `INSERT INTO contact_messages (
             id, created_at, name, email, organization, role, reason, message, source_path, ip_hash, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new')
           ON CONFLICT (id) DO NOTHING`,
          [
            row.id,
            row.createdAt,
            row.name,
            row.email,
            row.organization ?? null,
            row.role ?? null,
            row.reason,
            row.message,
            row.sourcePath ?? "/contact",
            row.ipHash ?? "legacy-import",
          ],
        );
      } catch {
        /* skip bad line */
      }
    }
  }
}

export async function listContactLeads(
  pool: pg.Pool,
  params: ListContactLeadsParams,
): Promise<ListContactLeadsResult> {
  await importLegacyJsonlIfEmpty(pool);

  const where: string[] = [];
  const values: unknown[] = [];
  let n = 1;

  if (params.q?.trim()) {
    where.push(
      `(name ILIKE $${n} OR email ILIKE $${n} OR COALESCE(organization, '') ILIKE $${n} OR message ILIKE $${n})`,
    );
    values.push(`%${params.q.trim()}%`);
    n += 1;
  }
  if (params.reason?.trim()) {
    where.push(`reason = $${n}`);
    values.push(params.reason.trim());
    n += 1;
  }
  if (params.status) {
    where.push(`status = $${n}`);
    values.push(params.status);
    n += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM contact_messages ${whereSql}`,
    values,
  );
  const total = Number(countResult.rows[0]?.n ?? 0);

  const listValues = [...values, params.limit, params.offset];
  const listResult = await pool.query<DbRow>(
    `SELECT id, created_at, updated_at, name, email, organization, role, reason, message,
            source_path, status, admin_notes, updated_by
     FROM contact_messages
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${n} OFFSET $${n + 1}`,
    listValues,
  );

  const statsResult = await pool.query<{ total: string; new_count: string; week_count: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'new')::text AS new_count,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::text AS week_count
     FROM contact_messages`,
  );
  const statsRow = statsResult.rows[0];

  return {
    leads: listResult.rows.map(mapRow),
    total,
    limit: params.limit,
    offset: params.offset,
    stats: {
      total: Number(statsRow?.total ?? 0),
      new: Number(statsRow?.new_count ?? 0),
      week: Number(statsRow?.week_count ?? 0),
    },
    source: "PostgreSQL · contact_messages",
  };
}

export async function updateContactLead(
  pool: pg.Pool,
  leadId: string,
  patch: { status?: LeadStatus; notes?: string },
  actorEmail: string,
): Promise<ContactLeadRow | null> {
  const sets: string[] = ["updated_by = $2", "updated_at = now()"];
  const values: unknown[] = [leadId, actorEmail];
  let n = 3;

  if (patch.status) {
    sets.push(`status = $${n}`);
    values.push(patch.status);
    n += 1;
  }
  if (patch.notes !== undefined) {
    sets.push(`admin_notes = $${n}`);
    values.push(patch.notes);
    n += 1;
  }

  const result = await pool.query<DbRow>(
    `UPDATE contact_messages SET ${sets.join(", ")}
     WHERE id = $1::uuid
     RETURNING id, created_at, updated_at, name, email, organization, role, reason, message,
               source_path, status, admin_notes, updated_by`,
    values,
  );

  const row = result.rows[0];
  return row ? mapRow(row) : null;
}
