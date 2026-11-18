/**
 * Pack/workflow execution binding for Stage 3 decision tokens.
 *
 * Defaults (when a pack omits a field):
 *   execution_control: observe
 *   on_aegis_unavailable: allow_and_flag
 *   executable_params: []  (no token issued until declared)
 *   action_type: loan.disburse
 *   token_ttl_sec: 3600
 */
import type pg from "pg";

export const DEFAULT_EXECUTABLE_PARAMS = [
  "amount",
  "currency",
  "beneficiary_account",
  "product",
] as const;

export type ExecutionControl = "observe" | "enforce";
export type OnAegisUnavailable = "allow_and_flag" | "block";
export type RequiredGrade = "G1" | "G2" | "G3";
export type OnMissingGrade = "await" | "exception";

export type WorkflowExecutionConfig = {
  executable_params: string[];
  execution_control: ExecutionControl;
  on_aegis_unavailable: OnAegisUnavailable;
  action_type: string;
  token_ttl_sec: number;
  /** Stage 4: minimum evidence grade for this workflow (null = none). */
  required_grade: RequiredGrade | null;
  /** When below required_grade past deadline: await or raise exception. */
  on_missing: OnMissingGrade;
  /** Hours after case creation before below_required_grade_past_deadline. */
  grade_deadline_hours: number;
};

export const DEFAULT_WORKFLOW_EXECUTION_CONFIG: WorkflowExecutionConfig = {
  executable_params: [],
  execution_control: "observe",
  on_aegis_unavailable: "allow_and_flag",
  action_type: "loan.disburse",
  token_ttl_sec: 3600,
  required_grade: null,
  on_missing: "await",
  grade_deadline_hours: 24,
};

export function normalizeExecutionConfig(
  raw: unknown,
): WorkflowExecutionConfig {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const params = Array.isArray(obj.executable_params)
    ? obj.executable_params.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  const control =
    obj.execution_control === "enforce" || obj.execution_control === "observe"
      ? obj.execution_control
      : "observe";
  const unavailable =
    obj.on_aegis_unavailable === "block" ||
    obj.on_aegis_unavailable === "allow_and_flag"
      ? obj.on_aegis_unavailable
      : "allow_and_flag";
  const actionType =
    typeof obj.action_type === "string" && obj.action_type.trim()
      ? obj.action_type.trim()
      : "loan.disburse";
  const ttl =
    typeof obj.token_ttl_sec === "number" &&
    Number.isFinite(obj.token_ttl_sec) &&
    obj.token_ttl_sec > 0
      ? Math.floor(obj.token_ttl_sec)
      : 3600;
  const required =
    obj.required_grade === "G1" ||
    obj.required_grade === "G2" ||
    obj.required_grade === "G3"
      ? obj.required_grade
      : null;
  const onMissing =
    obj.on_missing === "exception" || obj.on_missing === "await"
      ? obj.on_missing
      : "await";
  const deadline =
    typeof obj.grade_deadline_hours === "number" &&
    Number.isFinite(obj.grade_deadline_hours) &&
    obj.grade_deadline_hours > 0
      ? Math.floor(obj.grade_deadline_hours)
      : 24;
  return {
    executable_params: params,
    execution_control: control,
    on_aegis_unavailable: unavailable,
    action_type: actionType,
    token_ttl_sec: ttl,
    required_grade: required,
    on_missing: onMissing,
    grade_deadline_hours: deadline,
  };
}

/** Pack workflow shape → stored execution_config jsonb. */
export function executionConfigFromPackWorkflow(wf: {
  executable_params?: string[];
  execution_control?: string;
  on_aegis_unavailable?: string;
  action_type?: string;
  token_ttl_sec?: number;
  required_grade?: string | null;
  on_missing?: string;
  grade_deadline_hours?: number;
}): WorkflowExecutionConfig {
  return normalizeExecutionConfig(wf);
}

export async function getWorkflowExecutionConfig(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  workflowId: string | null | undefined,
): Promise<WorkflowExecutionConfig> {
  if (!workflowId) return { ...DEFAULT_WORKFLOW_EXECUTION_CONFIG };
  const result = await client.query<{ execution_config: unknown }>(
    `SELECT execution_config
     FROM governed_workflow
     WHERE organization_id = $1 AND workflow_id = $2`,
    [organizationId, workflowId],
  );
  if (!result.rows[0]) return { ...DEFAULT_WORKFLOW_EXECUTION_CONFIG };
  return normalizeExecutionConfig(result.rows[0].execution_config);
}

/**
 * Resolve config for a case: prefer the case's workflow; if missing, fall back to
 * a product match among the org's workflows.
 */
export async function resolveExecutionConfigForCase(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  input: {
    workflow_id?: string | null;
    product?: string | null;
    case_id?: string | null;
  },
): Promise<WorkflowExecutionConfig & { workflow_id: string | null }> {
  let workflowId = input.workflow_id?.trim() || null;
  if (!workflowId && input.case_id) {
    const row = await client.query<{ workflow_id: string | null }>(
      `SELECT workflow_id FROM bank_case
       WHERE organization_id = $1 AND case_id = $2`,
      [organizationId, input.case_id],
    );
    workflowId = row.rows[0]?.workflow_id ?? null;
  }
  if (!workflowId && input.product) {
    const row = await client.query<{ workflow_id: string; execution_config: unknown }>(
      `SELECT workflow_id, execution_config FROM governed_workflow
       WHERE organization_id = $1
         AND (
           execution_config->>'product' = $2
           OR description ILIKE '%' || $2 || '%'
           OR workflow_id ILIKE '%' || $2 || '%'
         )
       ORDER BY created_at ASC
       LIMIT 1`,
      [organizationId, input.product],
    );
    if (row.rows[0]) {
      return {
        ...normalizeExecutionConfig(row.rows[0].execution_config),
        workflow_id: row.rows[0].workflow_id,
      };
    }
  }
  const config = await getWorkflowExecutionConfig(client, organizationId, workflowId);
  return { ...config, workflow_id: workflowId };
}
