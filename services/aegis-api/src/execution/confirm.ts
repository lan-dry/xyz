/**
 * Executor confirm: token + actual params → seal executed or execution_mismatch.
 */
import type pg from "pg";
import {
  checkToken,
  diffExecutableParams,
  paramsHash,
  resolveOnAegisUnavailable,
  verifyDecisionToken,
  type DecisionToken,
  type ExecutableParams,
  type SignedEnvelope,
} from "@salanor/aegis-sdk";
import { issueForensicReceipt } from "../forensic/issue.js";
import { isReceiptSigningConfigured } from "../crypto/receipt-signing.js";
import { listPublishedReceiptKeys } from "../repo/receipt-keys.js";
import {
  buildFieldAssertions,
  buildProvenanceBlock,
} from "../sources/provenance.js";
import { getSourceKey } from "../sources/registry.js";
import { verifyEnvelope } from "@salanor/aegis-sdk";
import { nowIso } from "../time/clock.js";
import {
  claimDecisionToken,
  loadDecisionToken,
  loadDecisionTokenAnyTenant,
  recordExecutionException,
  type DecisionTokenRow,
} from "./decision-token.js";
import { resolveExecutionConfigForCase } from "./workflow-config.js";

export type ConfirmInput = {
  organizationId: string;
  token?: DecisionToken | null;
  params?: ExecutableParams | null;
  /** Preferred: executor source-signed envelope whose event carries the params. */
  source_envelope?: SignedEnvelope | null;
  break_glass?: boolean;
  reason?: string | null;
  case_id?: string | null;
  action_type?: string | null;
  /** Report an allow_and_flag offline execution after the fact. */
  flagged_unavailable?: boolean;
  signingKey?: { key_id: string; private_key_b64: string };
  now?: Date;
};

export type ConfirmSuccess = {
  ok: true;
  code: "matched" | "break_glass" | "allow_and_flag";
  token_id?: string;
  case_id?: string;
  receipt_id?: string;
  exception_id?: string;
  plain_summary: string;
};

export type ConfirmFailure = {
  ok: false;
  code:
    | "bad_signature"
    | "expired"
    | "used"
    | "revoked"
    | "stopped"
    | "params_mismatch"
    | "wrong_tenant"
    | "missing_token"
    | "missing_params"
    | "missing_reason"
    | "case_not_found"
    | "blocked_unavailable";
  message: string;
  mismatched_fields?: Array<{
    field: string;
    authorised: unknown;
    actual: unknown;
  }>;
  receipt_id?: string;
  exception_id?: string;
  on_aegis_unavailable?: "allow_and_flag" | "block";
};

export type ConfirmResult = ConfirmSuccess | ConfirmFailure;

async function publicKeyForToken(
  client: pg.Pool | pg.PoolClient,
  keyId: string,
): Promise<string | null> {
  const keys = await listPublishedReceiptKeys(client);
  const found = keys.find((k) => k.key_id === keyId);
  if (found) return found.public_key_b64;
  return null;
}

async function latestCaseOutcome(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  caseId: string,
): Promise<{ outcome: string; status: string } | null> {
  const caseRow = await client.query<{ status: string; outcome: string | null }>(
    `SELECT status, outcome FROM bank_case
     WHERE organization_id = $1 AND case_id = $2`,
    [organizationId, caseId],
  );
  if (!caseRow.rows[0]) return null;
  const receipt = await client.query<{ outcome: string }>(
    `SELECT outcome FROM forensic_receipt
     WHERE organization_id = $1 AND case_id = $2
     ORDER BY seq DESC LIMIT 1`,
    [organizationId, caseId],
  );
  return {
    status: caseRow.rows[0].status,
    outcome: receipt.rows[0]?.outcome ?? caseRow.rows[0].outcome ?? "unknown",
  };
}

function paramsFromEnvelope(envelope: SignedEnvelope): ExecutableParams | null {
  const event = envelope.event;
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const nested = event.params;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as ExecutableParams;
  }
  // Treat the event itself as params when it looks like executable fields.
  const { type: _t, confirm: _c, token_id: _id, ...rest } = event as Record<
    string,
    unknown
  >;
  void _t;
  void _c;
  void _id;
  return rest as ExecutableParams;
}

async function sealConfirmReceipt(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    caseId: string;
    decisionId: string;
    outcome: "executed" | "execution_mismatch" | "break_glass";
    plainSummary: string;
    attributes: Record<string, unknown>;
    signingKey?: { key_id: string; private_key_b64: string };
  },
): Promise<string | undefined> {
  if (!isReceiptSigningConfigured() && !input.signingKey) return undefined;
  try {
    const issued = await issueForensicReceipt(client, {
      organization_id: input.organizationId,
      case_id: input.caseId,
      decision_id: input.decisionId,
      outcome: input.outcome,
      mode: "enforce",
      matched_rules: [],
      plain_summary: input.plainSummary,
      sealed_events: [],
      attributes: input.attributes,
      provenance: buildProvenanceBlock({
        source_id: "aegis_executor_confirm",
        source_name: "Executor confirm",
        authentication: "bearer_key",
        field_assertions: buildFieldAssertions(Object.keys(input.attributes)),
        recorded_at: nowIso(),
        checks: {
          source_signed: false,
          approver_bound: false,
          execution_matched: input.outcome === "executed",
          reconciled: false,
          independently_captured: false,
        },
      }),
      signingKey: input.signingKey,
    });
    return issued.receipt_id;
  } catch (err) {
    console.error(
      "[execution/confirm] receipt seal failed",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

async function failMismatch(
  client: pg.Pool | pg.PoolClient,
  input: ConfirmInput,
  row: DecisionTokenRow | null,
  code: ConfirmFailure["code"],
  message: string,
  extra?: Partial<ConfirmFailure>,
): Promise<ConfirmFailure> {
  const caseId = row?.case_id ?? input.case_id ?? null;
  const kind =
    code === "params_mismatch"
      ? "execution_mismatch"
      : code === "used"
        ? "token_reuse"
        : code === "expired"
          ? "token_expired"
          : code === "revoked"
            ? "token_revoked"
            : code === "stopped"
              ? "case_stopped"
              : code === "wrong_tenant"
                ? "wrong_tenant"
                : code === "bad_signature"
                  ? "bad_signature"
                  : "execution_mismatch";

  let receiptId: string | undefined;
  if (caseId && row) {
    receiptId = await sealConfirmReceipt(client, {
      organizationId: input.organizationId,
      caseId,
      decisionId: `${row.decision_id}:mismatch`,
      outcome: "execution_mismatch",
      plainSummary: `Execution mismatch: ${message}`,
      attributes: {
        failure_code: code,
        token_id: row.token_id,
        mismatched_fields: extra?.mismatched_fields ?? null,
        actual_params_hash: input.params ? paramsHash(input.params) : null,
        authorised_params_hash: row.params_hash,
      },
      signingKey: input.signingKey,
    });
  }

  const exc = await recordExecutionException(client, {
    organizationId: input.organizationId,
    caseId,
    tokenId: row?.token_id ?? (input.token?.token_id as string | undefined) ?? null,
    kind,
    reason: message,
    detail: {
      code,
      mismatched_fields: extra?.mismatched_fields ?? null,
    },
    receiptId: receiptId ?? null,
  });

  return {
    ok: false,
    code,
    message,
    receipt_id: receiptId,
    exception_id: exc.exception_id,
    ...extra,
  };
}

export async function confirmExecution(
  client: pg.Pool | pg.PoolClient,
  input: ConfirmInput,
): Promise<ConfirmResult> {
  const now = input.now ?? new Date();

  // --- Break-glass (mandatory reason) ---
  if (input.break_glass) {
    const reason = input.reason?.trim() ?? "";
    if (!reason) {
      return {
        ok: false,
        code: "missing_reason",
        message: "break-glass requires a non-empty reason",
      };
    }
    const caseId = input.case_id?.trim() || input.token?.case_id;
    if (!caseId) {
      return {
        ok: false,
        code: "case_not_found",
        message: "case_id is required for break-glass",
      };
    }
    const receiptId = await sealConfirmReceipt(client, {
      organizationId: input.organizationId,
      caseId,
      decisionId: `break_glass:${caseId}`,
      outcome: "break_glass",
      plainSummary: `Break-glass execution: ${reason}`,
      attributes: {
        break_glass: true,
        reason,
        params: input.params ?? null,
        action_type: input.action_type ?? "loan.disburse",
      },
      signingKey: input.signingKey,
    });
    const exc = await recordExecutionException(client, {
      organizationId: input.organizationId,
      caseId,
      tokenId: input.token?.token_id ?? null,
      kind: "break_glass",
      reason,
      detail: { params: input.params ?? null },
      receiptId: receiptId ?? null,
      createdBy: "executor",
    });
    return {
      ok: true,
      code: "break_glass",
      case_id: caseId,
      receipt_id: receiptId,
      exception_id: exc.exception_id,
      plain_summary: `Break-glass execution recorded: ${reason}`,
    };
  }

  // --- Flagged offline (allow_and_flag reconnect) ---
  if (input.flagged_unavailable) {
    const caseId = input.case_id?.trim() || input.token?.case_id;
    const config = await resolveExecutionConfigForCase(client, input.organizationId, {
      case_id: caseId,
    });
    const policy = resolveOnAegisUnavailable(config.on_aegis_unavailable);
    if (!policy.proceed) {
      return {
        ok: false,
        code: "blocked_unavailable",
        message: "Workflow on_aegis_unavailable=block — execution refused while Aegis was unreachable",
        on_aegis_unavailable: "block",
      };
    }
    const exc = await recordExecutionException(client, {
      organizationId: input.organizationId,
      caseId: caseId ?? null,
      tokenId: input.token?.token_id ?? null,
      kind: "allow_and_flag",
      reason: input.reason?.trim() || "Executed while Aegis was unavailable (allow_and_flag)",
      detail: { params: input.params ?? null, policy: config.on_aegis_unavailable },
    });
    return {
      ok: true,
      code: "allow_and_flag",
      case_id: caseId,
      exception_id: exc.exception_id,
      plain_summary: "Flagged for reconciliation: executed while Aegis was unavailable",
    };
  }

  const token = input.token;
  if (!token || typeof token !== "object") {
    return { ok: false, code: "missing_token", message: "token is required" };
  }

  let params = input.params ?? null;
  let sourceId: string | null = null;

  if (input.source_envelope) {
    const env = input.source_envelope;
    const key = await getSourceKey(client, input.organizationId, env.key_id);
    if (!key || key.source_id !== env.source_id) {
      return {
        ok: false,
        code: "bad_signature",
        message: "executor source envelope key is unknown or mismatched",
      };
    }
    const verified = await verifyEnvelope(env, key.public_key_b64);
    if (!verified.ok) {
      return {
        ok: false,
        code: "bad_signature",
        message: `executor source envelope rejected: ${verified.reason}`,
      };
    }
    sourceId = env.source_id;
    const fromEnv = paramsFromEnvelope(env);
    if (fromEnv) params = fromEnv;
  }

  if (!params || typeof params !== "object") {
    return { ok: false, code: "missing_params", message: "params are required" };
  }

  // Wrong tenant: token exists under another org, or tenant field mismatches auth.
  if (typeof token.tenant === "string" && token.tenant !== input.organizationId) {
    const any = await loadDecisionTokenAnyTenant(client, String(token.token_id ?? ""));
    return failMismatch(client, input, any, "wrong_tenant", "token tenant does not match authenticated organisation");
  }

  const pub = await publicKeyForToken(client, String(token.key_id ?? ""));
  if (!pub) {
    return {
      ok: false,
      code: "bad_signature",
      message: `unknown decision key_id ${String(token.key_id)}`,
    };
  }

  const verified = await verifyDecisionToken(token, pub, { now });
  if (!verified.ok) {
    const row = await loadDecisionToken(
      client,
      input.organizationId,
      String(token.token_id ?? ""),
    );
    if (verified.reason === "expired") {
      return failMismatch(client, input, row, "expired", verified.detail ?? "token expired");
    }
    return failMismatch(
      client,
      input,
      row,
      "bad_signature",
      verified.detail ?? verified.reason,
    );
  }

  const row = await loadDecisionToken(
    client,
    input.organizationId,
    token.token_id,
  );
  if (!row) {
    return {
      ok: false,
      code: "missing_token",
      message: "token not found for this organisation",
    };
  }
  if (row.status === "revoked") {
    return failMismatch(client, input, row, "revoked", "token has been revoked");
  }
  if (row.status === "used") {
    return failMismatch(client, input, row, "used", "token has already been used");
  }

  const caseState = await latestCaseOutcome(
    client,
    input.organizationId,
    row.case_id,
  );
  if (!caseState) {
    return failMismatch(client, input, row, "case_not_found" as ConfirmFailure["code"], "case not found");
  }
  if (
    caseState.outcome === "stop" ||
    caseState.status === "stopped" ||
    caseState.outcome === "declined"
  ) {
    return failMismatch(
      client,
      input,
      row,
      "stopped",
      `case is ${caseState.outcome || caseState.status} — execution refused`,
    );
  }

  const offline = await checkToken(token, params, pub, {
    now,
    authorisedParams: row.executable_params,
  });
  if (!offline.ok) {
    const mismatched =
      offline.reason === "field_mismatch" && offline.mismatched_fields
        ? offline.mismatched_fields
        : diffExecutableParams(row.executable_params, params);
    return failMismatch(
      client,
      input,
      row,
      "params_mismatch",
      offline.detail ??
        `params hash mismatch; fields: ${mismatched.map((m) => m.field).join(", ") || "unknown"}`,
      { mismatched_fields: mismatched },
    );
  }

  // Claim atomically before sealing so concurrent confirms cannot both succeed.
  const claimed = await claimDecisionToken(client, input.organizationId, row.token_id, {
    sourceId,
    receiptId: null,
    now,
  });
  if (!claimed) {
    return failMismatch(
      client,
      input,
      row,
      "used",
      "token was claimed by a concurrent confirm",
    );
  }

  const receiptId = await sealConfirmReceipt(client, {
    organizationId: input.organizationId,
    caseId: row.case_id,
    decisionId: `${row.decision_id}:executed`,
    outcome: "executed",
    plainSummary: "Executed: parameters hash matched token",
    attributes: {
      token_id: row.token_id,
      params_hash: row.params_hash,
      action_type: row.action_type,
      source_id: sourceId,
      execution_matched: true,
    },
    signingKey: input.signingKey,
  });
  if (receiptId) {
    await client.query(
      `UPDATE decision_token SET confirm_receipt_id = $3
       WHERE organization_id = $1 AND token_id = $2`,
      [input.organizationId, row.token_id, receiptId],
    );
  }

  return {
    ok: true,
    code: "matched",
    token_id: row.token_id,
    case_id: row.case_id,
    receipt_id: receiptId,
    plain_summary: "Executed: parameters hash matched token",
  };
}

/** Expose unavailable policy for executors / tests without a confirm call. */
export function unavailablePolicyFor(
  on_aegis_unavailable: string | null | undefined,
) {
  return resolveOnAegisUnavailable(on_aegis_unavailable);
}
