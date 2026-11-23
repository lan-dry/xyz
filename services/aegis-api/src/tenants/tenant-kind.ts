/**
 * Tenant kinds for Gate 1 sandboxes.
 * Policy "environment=sandbox" remains a separate concept (draft matrix env).
 */
export type TenantKind = "real" | "demo" | "sandbox";

export type OrgTenantRow = {
  organization_id: string;
  slug: string;
  tenant_kind: TenantKind;
  is_demo: boolean;
  is_test: boolean;
  sandbox_expires_at: Date | null;
  sandbox_archived_at: Date | null;
  sandbox_read_only_until: Date | null;
  event_quota_daily: number | null;
};

export function normalizeTenantKind(raw: unknown): TenantKind {
  if (raw === "demo" || raw === "sandbox" || raw === "real") return raw;
  return "real";
}

export function isSandboxOrg(org: { tenant_kind?: string; is_test?: boolean }): boolean {
  return org.tenant_kind === "sandbox" || org.is_test === true;
}

export function isWipeableOrg(org: {
  tenant_kind?: string;
  is_demo?: boolean;
  is_test?: boolean;
}): boolean {
  return org.is_demo === true || org.is_test === true || org.tenant_kind === "sandbox";
}

/** Refuse promote sandbox → real. */
export function assertCanSetTenantKind(
  from: TenantKind,
  to: TenantKind,
): { ok: true } | { ok: false; code: string; message: string } {
  if (from === to) return { ok: true };
  if (from === "sandbox" && to === "real") {
    return {
      ok: false,
      code: "sandbox_immutable",
      message: "A sandbox cannot become a production organisation. Create a new organisation instead.",
    };
  }
  if (from === "demo" && to === "real") {
    return {
      ok: false,
      code: "demo_immutable",
      message: "A demo organisation cannot become a production organisation.",
    };
  }
  return { ok: true };
}
