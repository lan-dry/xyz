/**
 * Issue and persist AEGIS-TOKEN1 decision tokens.
 * Reuses receipt signing custody (same Ed25519 key) with domain AEGIS-TOKEN1.
 */
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  buildDecisionToken,
  jcs,
  pickExecutableParams,
  signDecisionToken,
  type DecisionToken,
  type ExecutableParams,
  type UnsignedDecisionToken,
} from "@salanor/aegis-sdk";
import {
  isReceiptSigningConfigured,
  resolveReceiptSigning,
  type ReceiptSigning,
} from "../crypto/receipt-signing.js";
import { publishReceiptSigningKey } from "../repo/receipt-keys.js";
import {
  normalizeExecutionConfig,
  type WorkflowExecutionConfig,
} from "./workflow-config.js";

export type DecisionTokenRow = {
  token_id: string;
  organization_id: string;
  case_id: string;
  decision_id: string;
  action_type: string;
  params_hash: string;
  executable_params: ExecutableParams;
  issued_at: string;
  expires_at: string;
  nonce: string;
  key_id: string;
  signature: string;
  token_body: DecisionToken;
  status: "issued" | "used" | "revoked";
  used_at: string | null;
  used_by_source_id: string | null;
  confirm_receipt_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  execution_control: "observe" | "enforce";
  on_aegis_unavailable: "allow_and_flag" | "block";
};

function tokenDigest(unsigned: UnsignedDecisionToken): Uint8Array {
  const prefixed = `AEGIS-TOKEN1\n${unsigned.key_id}\n${jcs(unsigned)}`;
  return new Uint8Array(createHash("sha256").update(prefixed, "utf8").digest());
}

async function signWithCustody(
  unsigned: UnsignedDecisionToken,
  signing: ReceiptSigning,
): Promise<DecisionToken> {
  const sig = await signing.sign(tokenDigest(unsigned));
  if (sig.length !== 64) {
    throw new Error("Ed25519 signature must be 64 bytes");
  }
  return { ...unsigned, signature: Buffer.from(sig).toString("base64url") };
}

function mapRow(row: {
  token_id: string;
  organization_id: string;
  case_id: string;
  decision_id: string;
  action_type: string;
  params_hash: string;
  executable_params: ExecutableParams;
  issued_at: Date;
  expires_at: Date;
  nonce: string;
  key_id: string;
  signature: string;
  token_body: DecisionToken;
  status: "issued" | "used" | "revoked";
  used_at: Date | null;
  used_by_source_id: string | null;
  confirm_receipt_id: string | null;
  revoked_at: Date | null;
  revoke_reason: string | null;
  execution_control: "observe" | "enforce";
  on_aegis_unavailable: "allow_and_flag" | "block";
}): DecisionTokenRow {
  return {
    ...row,
    issued_at: row.issued_at.toISOString(),
    expires_at: row.expires_at.toISOString(),
    used_at: row.used_at ? row.used_at.toISOString() : null,
    revoked_at: row.revoked_at ? row.revoked_at.toISOString() : null,
  };
}

export async function issueDecisionToken(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    caseId: string;
    decisionId: string;
    attributes: Record<string, unknown>;
    config: WorkflowExecutionConfig;
    /** Test / demo override. */
    signingKey?: { key_id: string; private_key_b64: string };
    now?: Date;
  },
): Promise<DecisionToken | null> {
  const config = normalizeExecutionConfig(input.config);
  if (config.executable_params.length === 0) {
    return null;
  }
  if (!isReceiptSigningConfigured() && !input.signingKey) {
    return null;
  }

  const params = pickExecutableParams(
    input.attributes,
    config.executable_params,
  );
  for (const field of config.executable_params) {
    if (!(field in params)) {
      return null;
    }
  }

  const signing = await resolveReceiptSigning({
    override: input.signingKey,
  });
  await publishReceiptSigningKey(client, signing);

  const now = input.now ?? new Date();
  const unsigned = buildDecisionToken({
    tenant: input.organizationId,
    case_id: input.caseId,
    decision_id: input.decisionId,
    action_type: config.action_type,
    params,
    key_id: signing.key_id,
    issued_at: now,
    ttl_sec: config.token_ttl_sec,
  });

  // Prefer SDK sign when we have a software seed (keeps test vectors aligned);
  // otherwise sign the TOKEN1 digest through receipt custody (incl. KMS).
  const token = input.signingKey
    ? await signDecisionToken(unsigned, input.signingKey.private_key_b64)
    : await signWithCustody(unsigned, signing);

  await client.query(
    `INSERT INTO decision_token (
       token_id, organization_id, case_id, decision_id, action_type,
       params_hash, executable_params, issued_at, expires_at, nonce,
       key_id, signature, token_body, status, execution_control, on_aegis_unavailable
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz,$9::timestamptz,$10,
       $11,$12,$13::jsonb,'issued',$14,$15
     )`,
    [
      token.token_id,
      input.organizationId,
      input.caseId,
      input.decisionId,
      token.action_type,
      token.params_hash,
      JSON.stringify(params),
      token.issued_at,
      token.expires_at,
      token.nonce,
      token.key_id,
      token.signature,
      JSON.stringify(token),
      config.execution_control,
      config.on_aegis_unavailable,
    ],
  );

  return token;
}

export async function loadDecisionToken(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  tokenId: string,
): Promise<DecisionTokenRow | null> {
  const result = await client.query(
    `SELECT *
     FROM decision_token
     WHERE organization_id = $1 AND token_id = $2`,
    [organizationId, tokenId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Load by token_id without tenant filter (then check tenant explicitly). */
export async function loadDecisionTokenAnyTenant(
  client: pg.Pool | pg.PoolClient,
  tokenId: string,
): Promise<DecisionTokenRow | null> {
  const result = await client.query(
    `SELECT * FROM decision_token WHERE token_id = $1`,
    [tokenId],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/**
 * Atomic single-use claim. Returns the row when this caller won;
 * null if already used, revoked, expired, or missing.
 */
export async function claimDecisionToken(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  tokenId: string,
  opts: { sourceId?: string | null; receiptId?: string | null; now?: Date },
): Promise<DecisionTokenRow | null> {
  const now = opts.now ?? new Date();
  const result = await client.query(
    `UPDATE decision_token
     SET status = 'used',
         used_at = $4::timestamptz,
         used_by_source_id = $5,
         confirm_receipt_id = $6
     WHERE organization_id = $1
       AND token_id = $2
       AND status = 'issued'
       AND expires_at > $3::timestamptz
     RETURNING *`,
    [
      organizationId,
      tokenId,
      now.toISOString(),
      now.toISOString(),
      opts.sourceId ?? null,
      opts.receiptId ?? null,
    ],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listDecisionTokensForCase(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  caseId: string,
): Promise<DecisionToken[]> {
  const result = await client.query<{ token_body: DecisionToken }>(
    `SELECT token_body FROM decision_token
     WHERE organization_id = $1 AND case_id = $2
     ORDER BY issued_at ASC`,
    [organizationId, caseId],
  );
  return result.rows.map((r) => r.token_body);
}

export function newExceptionId(): string {
  return `exc_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function recordExecutionException(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    caseId?: string | null;
    tokenId?: string | null;
    kind: string;
    reason: string;
    detail?: Record<string, unknown>;
    receiptId?: string | null;
    createdBy?: string | null;
  },
): Promise<{ exception_id: string }> {
  const exceptionId = newExceptionId();
  await client.query(
    `INSERT INTO execution_exception (
       exception_id, organization_id, case_id, token_id, kind, reason, detail, receipt_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [
      exceptionId,
      input.organizationId,
      input.caseId ?? null,
      input.tokenId ?? null,
      input.kind,
      input.reason.trim(),
      JSON.stringify(input.detail ?? {}),
      input.receiptId ?? null,
      input.createdBy ?? null,
    ],
  );
  return { exception_id: exceptionId };
}
