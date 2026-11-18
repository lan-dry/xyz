/**
 * Resolve the bank role to seal on an approval/release receipt.
 * Never use org membership roles (approver/admin/owner) — those title-case to "Approver".
 */
import type pg from "pg";
import { roleSatisfies } from "./authority-matrix.js";
import {
  listBankRoleLadder,
  listMembershipBankRoles,
  loadBankApprovalRoleContext,
  type BankRole,
} from "./repo.js";
import { roleDisplayName } from "./rule-preview.js";
import { formatRoleLabel } from "./describe-decision.js";

const ORG_MEMBERSHIP_ROLES = new Set([
  "owner",
  "admin",
  "approver",
  "engineer",
  "developer",
  "auditor",
  "viewer",
]);

export async function resolveActingBankRole(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  membershipId: string,
  opts: {
    delegationRoleKey?: string | null;
    requiredRole?: string | null;
  },
): Promise<{ roleKey: string | null; roleLabel: string | null }> {
  const required = opts.requiredRole?.trim() || null;
  let roleKey: string | null = opts.delegationRoleKey?.trim() || null;

  if (!roleKey) {
    const bankRoles = await listMembershipBankRoles(
      client,
      organizationId,
      membershipId,
    );
    if (required && bankRoles.includes(required)) {
      roleKey = required;
    } else if (required) {
      const ctx = await loadBankApprovalRoleContext(
        client,
        organizationId,
        membershipId,
      );
      if (ctx.available) {
        for (const r of ctx.actorRoles) {
          if (
            !ORG_MEMBERSHIP_ROLES.has(r) &&
            roleSatisfies(ctx.ladder, r, required)
          ) {
            roleKey = r;
            break;
          }
        }
      }
    }
    if (!roleKey) {
      roleKey =
        bankRoles.find((r) => !ORG_MEMBERSHIP_ROLES.has(r)) ??
        required ??
        null;
    }
  }

  if (roleKey && ORG_MEMBERSHIP_ROLES.has(roleKey)) {
    roleKey = required;
  }

  const ladder: BankRole[] = await listBankRoleLadder(client, organizationId);
  const roleLabel =
    roleDisplayName(ladder, roleKey) ?? formatRoleLabel(roleKey);
  return { roleKey, roleLabel };
}
