import { normalizePostgresDatabaseUrl } from "@salanor/db-url";
import pg from "pg";

export type OpenRolePublic = {
  id: string;
  slug: string;
  title: string;
  team: string;
  location: string;
  seniority: string;
  employmentType: string;
  summary: string;
  summaryHtml: string;
  requirements: string;
  requirementsHtml: string;
  compensationRange: string | null;
  postedAt: string;
  closesAt: string | null;
  status: string;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  team: string;
  location: string;
  seniority: string;
  employment_type: string;
  summary: string;
  requirements: string;
  compensation_range: string | null;
  posted_at: Date;
  closes_at: Date | null;
  status: string;
};

function pool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  return new pg.Pool({
    connectionString: normalizePostgresDatabaseUrl(url),
    max: 2,
  });
}

export async function listOpenRoles(): Promise<Omit<OpenRolePublic, "summary" | "summaryHtml" | "requirements" | "requirementsHtml">[]> {
  const p = pool();
  if (!p) return [];
  try {
    const res = await p.query<Row>(
      `SELECT id, slug, title, team, location, seniority, employment_type,
              summary, requirements, compensation_range, posted_at, closes_at, status
       FROM open_roles
       WHERE status = 'open'
       ORDER BY posted_at DESC
       LIMIT 100`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      team: r.team,
      location: r.location,
      seniority: r.seniority,
      employmentType: r.employment_type,
      compensationRange: r.compensation_range,
      postedAt: r.posted_at.toISOString(),
      closesAt: r.closes_at?.toISOString() ?? null,
      status: r.status,
    }));
  } catch {
    return [];
  } finally {
    await p.end().catch(() => undefined);
  }
}

export async function getOpenRoleBySlug(slug: string): Promise<OpenRolePublic | null> {
  const p = pool();
  if (!p) return null;
  const { markdownToSafeHtml } = await import("./markdown");
  try {
    const res = await p.query<Row>(
      `SELECT id, slug, title, team, location, seniority, employment_type,
              summary, requirements, compensation_range, posted_at, closes_at, status
       FROM open_roles
       WHERE slug = $1 AND status = 'open'
       LIMIT 1`,
      [slug.trim().toLowerCase()],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      team: r.team,
      location: r.location,
      seniority: r.seniority,
      employmentType: r.employment_type,
      summary: r.summary,
      summaryHtml: markdownToSafeHtml(r.summary),
      requirements: r.requirements,
      requirementsHtml: markdownToSafeHtml(r.requirements),
      compensationRange: r.compensation_range,
      postedAt: r.posted_at.toISOString(),
      closesAt: r.closes_at?.toISOString() ?? null,
      status: r.status,
    };
  } catch {
    return null;
  } finally {
    await p.end().catch(() => undefined);
  }
}
