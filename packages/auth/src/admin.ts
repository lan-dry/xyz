import type { SalInternalUserIdRow, SalanorAuthPrisma } from "./prisma-types";
import { type InternalRole, isInternalRole } from "./internal-roles";

/** Shown on sign-in when the account is not allowed (internal admin, console org, or invite). */
export const ADMIN_ALLOWLIST_DENIED_MESSAGE =
  "Your account must be listed in sal_internal_users (with an admin role), belong to an Aegis organization, or have a pending invite. Contact your administrator for access.";

export const PLATFORM_SUSPENDED_MESSAGE =
  "This account has been suspended by a platform administrator. Contact support if you believe this is an error.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function adminEmailsFromEnv(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => normalizeEmail(stripEnvQuotes(e)))
      .filter(Boolean),
  );
}

function isAdminEmailsBootstrapEnabled(): boolean {
  if (process.env.ADMIN_EMAILS_BOOTSTRAP === "1") return true;
  return process.env.NODE_ENV === "development";
}

type SignInEmailSource = { email?: string | null } | null | undefined;

/** Prefer adapter user email; fall back to OAuth profile when user.email is missing. */
export function resolveSignInEmail(user: SignInEmailSource, profile?: SignInEmailSource): string | null {
  const fromUser = user?.email?.trim();
  if (fromUser) return normalizeEmail(fromUser);
  const fromProfile = profile?.email?.trim();
  if (fromProfile) return normalizeEmail(fromProfile);
  return null;
}

export async function getInternalRoleForEmail(
  email: string | null | undefined,
  prisma?: SalanorAuthPrisma,
): Promise<InternalRole | null> {
  if (!email?.trim() || !prisma) return null;
  try {
    const row = (await prisma.salInternalUser.findUnique({
      where: { email: normalizeEmail(email) },
      select: { role: true },
    })) as { role?: string } | null;
    return isInternalRole(row?.role) ? row.role : null;
  } catch {
    return null;
  }
}

/**
 * Dev-only: when `ADMIN_EMAILS_BOOTSTRAP=1` or `NODE_ENV=development`, upsert a
 * `superadmin` row for emails listed in `ADMIN_EMAILS`.
 */
export async function maybeBootstrapInternalUser(
  email: string | null | undefined,
  prisma: SalanorAuthPrisma & {
    salInternalUser: {
      upsert(args: unknown): Promise<unknown>;
    };
  },
): Promise<InternalRole | null> {
  if (!isAdminEmailsBootstrapEnabled() || !email?.trim()) return null;
  const normalized = normalizeEmail(email);
  if (!adminEmailsFromEnv().has(normalized)) return null;
  try {
    const row = (await prisma.salInternalUser.upsert({
      where: { email: normalized },
      create: { email: normalized, role: "superadmin" },
      update: { role: "superadmin" },
      select: { role: true },
    })) as { role?: string };
    return isInternalRole(row.role) ? row.role : "superadmin";
  } catch {
    return null;
  }
}

/**
 * Returns true when `email` has a row in `sal_internal_users` with a valid role.
 * `ADMIN_EMAILS` alone does not grant access (except dev bootstrap above).
 */
export async function isAllowedAdminEmail(
  email: string | null | undefined,
  prisma?: SalanorAuthPrisma,
): Promise<boolean> {
  if (!email?.trim()) return false;
  if (!prisma) return false;

  const role = await getInternalRoleForEmail(email, prisma);
  if (role) return true;

  const bootstrapped = await maybeBootstrapInternalUser(
    email,
    prisma as SalanorAuthPrisma & {
      salInternalUser: { upsert(args: unknown): Promise<unknown> };
    },
  );
  return bootstrapped !== null;
}

/** @deprecated Use getInternalRoleForEmail — kept for callers that only need presence. */
export async function hasInternalUserRow(
  email: string | null | undefined,
  prisma?: SalanorAuthPrisma,
): Promise<boolean> {
  return isAllowedAdminEmail(email, prisma);
}
