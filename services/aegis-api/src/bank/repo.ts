import type pg from "pg";
import { listActiveDelegatedRoles } from "./approval-delegate.js";
import type { AuthorityMatrixRow, BankRole } from "./authority-matrix.js";
import type { FieldPolicyRule } from "./field-policy.js";

async function publicRelationExists(
  client: pg.Pool | pg.PoolClient,
  tableName: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listBankRoleLadder(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<BankRole[]> {
  const result = await client.query<BankRole>(
    `SELECT role_key, display_name, level
     FROM bank_role_ladder
     WHERE organization_id = $1
     ORDER BY level ASC`,
    [organizationId],
  );
  return result.rows;
}

export async function listMembershipBankRoles(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  membershipId: string,
): Promise<string[]> {
  const result = await client.query<{ role_key: string }>(
    `SELECT role_key
     FROM membership_bank_role
     WHERE organization_id = $1 AND membership_id = $2`,
    [organizationId, membershipId],
  );
  return result.rows.map((r) => r.role_key);
}

/**
 * Load ladder + actor bank roles. If forensic bank tables are not migrated yet,
 * returns available:false so callers can skip role-level checks without aborting
 * an open transaction.
 */
export async function loadBankApprovalRoleContext(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  membershipId: string,
): Promise<{ available: boolean; ladder: BankRole[]; actorRoles: string[] }> {
  const hasLadder = await publicRelationExists(client, "bank_role_ladder");
  const hasMembershipRoles = await publicRelationExists(
    client,
    "membership_bank_role",
  );
  if (!hasLadder || !hasMembershipRoles) {
    return { available: false, ladder: [], actorRoles: [] };
  }

  const ladder = await listBankRoleLadder(client, organizationId);
  const permanent = await listMembershipBankRoles(
    client,
    organizationId,
    membershipId,
  );
  const delegated = await listActiveDelegatedRoles(
    client,
    organizationId,
    membershipId,
  );
  const actorRoles = [...new Set([...permanent, ...delegated])];
  return { available: true, ladder, actorRoles };
}

export async function listAuthorityMatrix(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<AuthorityMatrixRow[]> {
  const result = await client.query<{
    matrix_id: string;
    product: string;
    amount_min: string;
    amount_max: string | null;
    currency: string;
    risk_tier: string | null;
    required_role: string | null;
    outcome: "allow" | "hold" | "stop";
    rule_code: string | null;
    active: boolean;
  }>(
    `SELECT matrix_id, product, amount_min::text, amount_max::text, currency,
            risk_tier, required_role, outcome, rule_code, active
     FROM authority_matrix
     WHERE organization_id = $1 AND active = true`,
    [organizationId],
  );
  return result.rows.map((r) => ({
    matrix_id: r.matrix_id,
    product: r.product,
    amount_min: Number(r.amount_min),
    amount_max: r.amount_max == null ? null : Number(r.amount_max),
    currency: r.currency,
    risk_tier: r.risk_tier,
    required_role: r.required_role,
    outcome: r.outcome,
    rule_code: r.rule_code,
    active: r.active,
  }));
}

export async function listFieldPolicies(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<FieldPolicyRule[]> {
  const result = await client.query<{
    field_path: string;
    mode: FieldPolicyRule["mode"];
    mask_keep_last: number;
  }>(
    `SELECT field_path, mode, mask_keep_last
     FROM field_policy
     WHERE organization_id = $1`,
    [organizationId],
  );
  return result.rows;
}

export async function getWorkflowRecordOnly(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  workflowId: string | undefined,
): Promise<boolean> {
  if (!workflowId) return false;
  const result = await client.query<{ record_only: boolean }>(
    `SELECT COALESCE(record_only, false) AS record_only
     FROM governed_workflow
     WHERE organization_id = $1 AND workflow_id = $2`,
    [organizationId, workflowId],
  );
  return result.rows[0]?.record_only ?? false;
}

export type BankCaseRow = {
  case_id: string;
  organization_id: string;
  idempotency_key: string | null;
  decision_id: string | null;
  receipt_id: string | null;
  outcome: string | null;
  mode: string;
  status: string;
  event_id: string | null;
  trace_id: string | null;
};

export async function findCaseByIdempotency(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<BankCaseRow | null> {
  const result = await client.query<BankCaseRow>(
    `SELECT case_id, organization_id, idempotency_key, decision_id, receipt_id,
            outcome, mode, status, event_id, trace_id
     FROM bank_case
     WHERE organization_id = $1 AND idempotency_key = $2`,
    [organizationId, idempotencyKey],
  );
  return result.rows[0] ?? null;
}

export async function upsertBankCase(
  client: pg.Pool | pg.PoolClient,
  row: {
    case_id: string;
    organization_id: string;
    idempotency_key: string;
    workflow_id?: string | null;
    trace_id?: string | null;
    event_id?: string | null;
    decision_id: string;
    receipt_id: string;
    outcome: string;
    mode: string;
    status: string;
    attributes: Record<string, unknown>;
    matched_rules: unknown;
    policy_id?: string | null;
    policy_version?: number | null;
    policy_content_hash?: string | null;
  },
): Promise<"inserted" | "updated" | "conflict"> {
  // SAVEPOINT only when already in a transaction — otherwise a failed INSERT does
  // not abort anything and SAVEPOINT itself errors ("can only be used in transaction blocks").
  const txState = await client.query<{ in_tx: boolean }>(
    "SELECT txid_current_if_assigned() IS NOT NULL AS in_tx",
  );
  const inTx = Boolean(txState.rows[0]?.in_tx);
  if (inTx) {
    await client.query("SAVEPOINT sp_upsert_bank_case");
  }
  try {
    await client.query(
      `INSERT INTO bank_case (
         case_id, organization_id, idempotency_key, workflow_id, trace_id, event_id,
         decision_id, receipt_id, outcome, mode, status, attributes, matched_rules,
         policy_id, policy_version, policy_content_hash
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16
       )`,
      [
        row.case_id,
        row.organization_id,
        row.idempotency_key,
        row.workflow_id ?? null,
        row.trace_id ?? null,
        row.event_id ?? null,
        row.decision_id,
        row.receipt_id,
        row.outcome,
        row.mode,
        row.status,
        JSON.stringify(row.attributes),
        JSON.stringify(row.matched_rules),
        row.policy_id ?? null,
        row.policy_version ?? null,
        row.policy_content_hash ?? null,
      ],
    );
    if (inTx) {
      await client.query("RELEASE SAVEPOINT sp_upsert_bank_case");
    }
    return "inserted";
  } catch (err) {
    if (inTx) {
      await client.query("ROLLBACK TO SAVEPOINT sp_upsert_bank_case");
    }
    const code = (err as { code?: string }).code;
    if (code !== "23505") throw err;

    // Same idempotency → idempotent replay.
    const sameIdem = await findCaseByIdempotency(
      client,
      row.organization_id,
      row.idempotency_key,
    );
    if (sameIdem) return "conflict";

    // Same case_id, new event (e.g. sanctions overlay) → update sealed outcome.
    await client.query(
      `UPDATE bank_case SET
         decision_id = $3,
         receipt_id = $4,
         outcome = $5,
         mode = $6,
         status = $7,
         attributes = $8::jsonb,
         matched_rules = $9::jsonb,
         event_id = COALESCE($10, event_id),
         policy_id = COALESCE($11, policy_id),
         policy_version = COALESCE($12, policy_version),
         policy_content_hash = COALESCE($13, policy_content_hash)
       WHERE organization_id = $1 AND case_id = $2`,
      [
        row.organization_id,
        row.case_id,
        row.decision_id,
        row.receipt_id,
        row.outcome,
        row.mode,
        row.status,
        JSON.stringify(row.attributes),
        JSON.stringify(row.matched_rules),
        row.event_id ?? null,
        row.policy_id ?? null,
        row.policy_version ?? null,
        row.policy_content_hash ?? null,
      ],
    );
    return "updated";
  }
}

/** Apply a policy pack's roles + matrix to a tenant (demo or custom). */
export async function seedAuthorityFromPack(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  ladder: BankRole[],
  matrix: Array<Omit<AuthorityMatrixRow, "matrix_id"> & { matrix_id?: string }>,
  options?: { force?: boolean },
): Promise<void> {
  const force = options?.force === true;
  for (const role of ladder) {
    if (force) {
      await client.query(
        `INSERT INTO bank_role_ladder (organization_id, role_key, display_name, level)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, role_key) DO UPDATE
           SET display_name = EXCLUDED.display_name, level = EXCLUDED.level`,
        [organizationId, role.role_key, role.display_name, role.level],
      );
    } else {
      // Never overwrite a customer's renamed role silently.
      await client.query(
        `INSERT INTO bank_role_ladder (organization_id, role_key, display_name, level)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, role_key) DO NOTHING`,
        [organizationId, role.role_key, role.display_name, role.level],
      );
    }
  }
  for (const row of matrix) {
    const id =
      row.matrix_id ??
      `mtx_${organizationId.replace(/-/g, "").slice(0, 8)}_${row.product}_${row.amount_min}`;
    if (force) {
      await client.query(
        `INSERT INTO authority_matrix (
           matrix_id, organization_id, product, amount_min, amount_max, currency,
           risk_tier, required_role, outcome, rule_code, active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
         ON CONFLICT (matrix_id) DO UPDATE SET
           amount_min = EXCLUDED.amount_min,
           amount_max = EXCLUDED.amount_max,
           required_role = EXCLUDED.required_role,
           outcome = EXCLUDED.outcome,
           rule_code = EXCLUDED.rule_code,
           active = true`,
        [
          id,
          organizationId,
          row.product,
          row.amount_min,
          row.amount_max,
          row.currency,
          row.risk_tier,
          row.required_role,
          row.outcome,
          row.rule_code,
        ],
      );
    } else {
      await client.query(
        `INSERT INTO authority_matrix (
           matrix_id, organization_id, product, amount_min, amount_max, currency,
           risk_tier, required_role, outcome, rule_code, active
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
         ON CONFLICT (matrix_id) DO NOTHING`,
        [
          id,
          organizationId,
          row.product,
          row.amount_min,
          row.amount_max,
          row.currency,
          row.risk_tier,
          row.required_role,
          row.outcome,
          row.rule_code,
        ],
      );
    }
  }
}
