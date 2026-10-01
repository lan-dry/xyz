import type { PrismaClient } from "@prisma/client";

import type { PlatformServerSession } from "@/lib/platform-server-session";

export type PublicStaffProfile = {
  name: string;
  role: string;
  bio: string;
  photoUrl: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
};

/** @deprecated alias */
export type ResearchByline = PublicStaffProfile;

type BylineRow = {
  byline_name: string | null;
  byline_title: string | null;
  byline_bio: string | null;
  byline_photo_url: string | null;
  byline_linkedin_url: string | null;
  byline_x_url: string | null;
  byline_instagram_url: string | null;
};

function rowToProfile(row: BylineRow): PublicStaffProfile {
  return {
    name: row.byline_name?.trim() ?? "",
    role: row.byline_title?.trim() ?? "",
    bio: row.byline_bio?.trim() ?? "",
    photoUrl: row.byline_photo_url?.trim() || null,
    linkedinUrl: row.byline_linkedin_url?.trim() || null,
    xUrl: row.byline_x_url?.trim() || null,
    instagramUrl: row.byline_instagram_url?.trim() || null,
  };
}

export function suggestedPublicName(session: PlatformServerSession): string {
  return (
    session.display_name?.trim() ||
    session.email.split("@")[0]?.trim() ||
    ""
  );
}

/** Form values: saved profile from DB, or empty fields with only a suggested name. */
export function resolveResearchBylineDisplay(
  session: PlatformServerSession,
  stored: PublicStaffProfile | null,
): PublicStaffProfile {
  const hasStored = Boolean(
    stored?.name?.trim() ||
      stored?.role?.trim() ||
      stored?.bio?.trim() ||
      stored?.photoUrl ||
      stored?.linkedinUrl ||
      stored?.xUrl ||
      stored?.instagramUrl,
  );
  if (hasStored && stored) {
    return stored;
  }
  return {
    name: suggestedPublicName(session),
    role: "",
    bio: "",
    photoUrl: null,
    linkedinUrl: null,
    xUrl: null,
    instagramUrl: null,
  };
}

export async function getResearchBylineForAccount(
  prisma: PrismaClient,
  accountId: string,
): Promise<PublicStaffProfile | null> {
  const rows = await prisma.$queryRaw<BylineRow[]>`
    SELECT
      byline_name,
      byline_title,
      byline_bio,
      byline_photo_url,
      byline_linkedin_url,
      byline_x_url,
      byline_instagram_url
    FROM account
    WHERE account_id = ${accountId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return rowToProfile(row);
}

export function assertPublicProfileComplete(profile: PublicStaffProfile | null): void {
  if (!profile?.name?.trim() || !profile.role?.trim() || !profile.bio?.trim()) {
    throw new Error(
      "Complete Content → My public profile (name, title, bio) before publishing.",
    );
  }
}

/** @deprecated use getResearchBylineForAccount + assertPublicProfileComplete */
export async function ensureDefaultResearchByline(
  prisma: PrismaClient,
  session: PlatformServerSession,
): Promise<PublicStaffProfile> {
  const profile = await getResearchBylineForAccount(prisma, session.account_id);
  if (!profile) {
    throw new Error("Account not found for public profile.");
  }
  return profile;
}

function normalizeOptionalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("URL must be http or https");
    }
    return u.toString();
  } catch {
    throw new Error(`Invalid URL: ${trimmed}`);
  }
}

export async function updateResearchBylineForAccount(
  prisma: PrismaClient,
  accountId: string,
  data: PublicStaffProfile,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE account
    SET
      byline_name = ${data.name.trim()},
      byline_title = ${data.role.trim()},
      byline_bio = ${data.bio.trim()},
      byline_photo_url = ${data.photoUrl},
      byline_linkedin_url = ${data.linkedinUrl},
      byline_x_url = ${data.xUrl},
      byline_instagram_url = ${data.instagramUrl},
      updated_at = now()
    WHERE account_id = ${accountId}::uuid
  `;
}

export function publicProfileFromForm(formData: FormData): PublicStaffProfile {
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const photoUrl = String(formData.get("photoUrl") ?? "").trim() || null;

  if (!name || !role || !bio) {
    throw new Error("Name, title, and bio are required.");
  }

  return {
    name,
    role,
    bio,
    photoUrl,
    linkedinUrl: normalizeOptionalUrl(String(formData.get("linkedinUrl") ?? "")),
    xUrl: normalizeOptionalUrl(String(formData.get("xUrl") ?? "")),
    instagramUrl: normalizeOptionalUrl(String(formData.get("instagramUrl") ?? "")),
  };
}
