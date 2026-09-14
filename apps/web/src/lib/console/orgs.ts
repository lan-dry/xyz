const ORG_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyOrganizationSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeOrganizationSlug(raw: string): string {
  return slugifyOrganizationSlug(raw);
}

export function isValidOrganizationSlug(slug: string): boolean {
  if (!slug) return false;
  if (slug.length < 3 || slug.length > 48) return false;
  return ORG_SLUG_RE.test(slug);
}

export function validateOrganizationName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 2 || name.length > 100) return null;
  return name;
}
