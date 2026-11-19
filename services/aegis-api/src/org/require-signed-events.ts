/**
 * Organization setting: require_signed_events.
 *
 * Enabling is single-admin (apply + seal). Disabling requires a second distinct
 * admin to confirm. Every applied change is sealed as a forensic receipt with
 * outcome `setting_change` so it appears in the tenant chain / evidence bundles.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { issueForensicReceipt } from "../forensic/issue.js";
import { isReceiptSigningConfigured } from "../crypto/receipt-signing.js";
import type { SignedForensicReceipt } from "../forensic/receipt.js";

type Db = pg.Pool | pg.PoolClient;

export const REQUIRE_SIGNED_EVENTS_KEY = "require_signed_events" as const;
export const SETTING_CHANGE_OUTCOME = "setting_change" as const;
export const REQUIRE_SIGNED_EVENTS_CASE_ID = "ORG-SETTING-require_signed_events";

export type OrganizationSettingChangeRow = {
  change_id: string;
  organization_id: string;
  setting_key: string;
  from_value: unknown;
  to_value: unknown;
  requested_by: string;
  confirmed_by: string | null;
  status: "pending" | "applied" | "cancelled";
  created_at: Date;
  decided_at: Date | null;
};

export type RequireSignedEventsState = {
  require_signed_events: boolean;
  pending_change: {
    change_id: string;
    from_value: boolean;
    to_value: boolean;
    requested_by: string;
    created_at: string;
  } | null;
};

export async function getRequireSignedEventsState(
  db: Db,
  organizationId: string,
): Promise<RequireSignedEventsState> {
  const flag = await db.query<{ require_signed_events: boolean }>(
    `SELECT require_signed_events FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  if (!flag.rows[0]) {
    throw new Error("organization_not_found");
  }
  const pending = await db.query<{
    change_id: string;
    from_value: unknown;
    to_value: unknown;
    requested_by: string;
    created_at: Date;
  }>(
    `SELECT change_id, from_value, to_value, requested_by, created_at
       FROM organization_setting_change
      WHERE organization_id = $1
        AND setting_key = $2
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`,
    [organizationId, REQUIRE_SIGNED_EVENTS_KEY],
  );
  const p = pending.rows[0];
  return {
    require_signed_events: flag.rows[0].require_signed_events === true,
    pending_change: p
      ? {
          change_id: p.change_id,
          from_value: jsonbBool(p.from_value),
          to_value: jsonbBool(p.to_value),
          requested_by: p.requested_by,
          created_at: p.created_at.toISOString(),
        }
      : null,
  };
}

function jsonbBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && "value" in (v as object)) {
    return Boolean((v as { value: unknown }).value);
  }
  return Boolean(v);
}

function asJsonbBool(v: boolean): string {
  return JSON.stringify(v);
}

async function sealSettingChange(
  db: Db,
  input: {
    organization_id: string;
    change_id: string;
    from_value: boolean;
    to_value: boolean;
    requested_by: string;
    confirmed_by: string | null;
  },
): Promise<SignedForensicReceipt | null> {
  if (!isReceiptSigningConfigured()) {
    return null;
  }
  return issueForensicReceipt(db, {
    organization_id: input.organization_id,
    case_id: REQUIRE_SIGNED_EVENTS_CASE_ID,
    decision_id: `setting_${input.change_id}`,
    outcome: SETTING_CHANGE_OUTCOME,
    mode: "record_only",
    matched_rules: [],
    plain_summary: input.to_value
      ? "Organisation now requires signed source events (require_signed_events=true)."
      : "Organisation no longer requires signed source events (require_signed_events=false). Two-person confirmation applied.",
    sealed_events: [],
    attributes: {
      setting_change: {
        setting_key: REQUIRE_SIGNED_EVENTS_KEY,
        change_id: input.change_id,
        from_value: input.from_value,
        to_value: input.to_value,
        requested_by: input.requested_by,
        confirmed_by: input.confirmed_by,
      },
      require_signed_events_in_force: input.to_value,
    },
  });
}

export type SetRequireSignedEventsResult =
  | {
      status: "applied";
      require_signed_events: boolean;
      change_id: string;
      receipt_id: string | null;
      receipt_hash: string | null;
    }
  | {
      status: "pending_confirmation";
      require_signed_events: boolean;
      change_id: string;
      message: string;
    }
  | {
      status: "unchanged";
      require_signed_events: boolean;
    };

/**
 * Enable immediately (single admin). Disable creates a pending change; a second
 * distinct admin calling with enabled=false confirms and applies.
 */
export async function setRequireSignedEvents(
  db: Db,
  input: {
    organization_id: string;
    enabled: boolean;
    actor_membership_id: string;
  },
): Promise<SetRequireSignedEventsResult> {
  const state = await getRequireSignedEventsState(db, input.organization_id);
  const current = state.require_signed_events;

  if (input.enabled === true) {
    // Cancel any pending disable when (re)enabling.
    if (state.pending_change) {
      await db.query(
        `UPDATE organization_setting_change
            SET status = 'cancelled', decided_at = now(), confirmed_by = $2
          WHERE change_id = $1 AND status = 'pending'`,
        [state.pending_change.change_id, input.actor_membership_id],
      );
    }
    if (current === true) {
      return { status: "unchanged", require_signed_events: true };
    }
    const changeId = `osc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await db.query(
      `INSERT INTO organization_setting_change (
         change_id, organization_id, setting_key, from_value, to_value,
         requested_by, confirmed_by, status, decided_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6, 'applied', now())`,
      [
        changeId,
        input.organization_id,
        REQUIRE_SIGNED_EVENTS_KEY,
        asJsonbBool(false),
        asJsonbBool(true),
        input.actor_membership_id,
      ],
    );
    await db.query(
      `UPDATE organization
          SET require_signed_events = true, updated_at = now()
        WHERE organization_id = $1`,
      [input.organization_id],
    );
    const receipt = await sealSettingChange(db, {
      organization_id: input.organization_id,
      change_id: changeId,
      from_value: false,
      to_value: true,
      requested_by: input.actor_membership_id,
      confirmed_by: input.actor_membership_id,
    });
    return {
      status: "applied",
      require_signed_events: true,
      change_id: changeId,
      receipt_id: receipt?.receipt_id ?? null,
      receipt_hash: receipt?.receipt_hash ?? null,
    };
  }

  // Disabling: two-person rule.
  if (current === false && !state.pending_change) {
    return { status: "unchanged", require_signed_events: false };
  }

  if (!state.pending_change) {
    const changeId = `osc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    await db.query(
      `INSERT INTO organization_setting_change (
         change_id, organization_id, setting_key, from_value, to_value,
         requested_by, status
       ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, 'pending')`,
      [
        changeId,
        input.organization_id,
        REQUIRE_SIGNED_EVENTS_KEY,
        asJsonbBool(true),
        asJsonbBool(false),
        input.actor_membership_id,
      ],
    );
    return {
      status: "pending_confirmation",
      require_signed_events: current,
      change_id: changeId,
      message:
        "Disable requested. A second distinct admin must confirm by posting enabled: false again.",
    };
  }

  if (state.pending_change.requested_by === input.actor_membership_id) {
    const err = new Error(
      "Four-eyes: a different admin must confirm disabling require_signed_events.",
    );
    (err as { code?: string }).code = "four_eyes_same_admin";
    throw err;
  }

  const changeId = state.pending_change.change_id;
  await db.query(
    `UPDATE organization_setting_change
        SET status = 'applied', confirmed_by = $2, decided_at = now()
      WHERE change_id = $1 AND status = 'pending'`,
    [changeId, input.actor_membership_id],
  );
  await db.query(
    `UPDATE organization
        SET require_signed_events = false, updated_at = now()
      WHERE organization_id = $1`,
    [input.organization_id],
  );
  const receipt = await sealSettingChange(db, {
    organization_id: input.organization_id,
    change_id: changeId,
    from_value: true,
    to_value: false,
    requested_by: state.pending_change.requested_by,
    confirmed_by: input.actor_membership_id,
  });
  return {
    status: "applied",
    require_signed_events: false,
    change_id: changeId,
    receipt_id: receipt?.receipt_id ?? null,
    receipt_hash: receipt?.receipt_hash ?? null,
  };
}
