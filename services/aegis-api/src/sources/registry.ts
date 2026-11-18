/**
 * Source registry: sources, their Ed25519 public keys, and an append-only
 * history of every registry change (feeds evidence bundles).
 */
import type pg from "pg";

export const SOURCE_KINDS = [
  "application",
  "executor",
  "collector",
  "third_party",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type SourceStatus = "active" | "disabled";
export type SourceKeyStatus = "active" | "rotated" | "revoked";

export type RegistryAction =
  | "registered"
  | "key_added"
  | "key_rotated"
  | "key_revoked"
  | "source_disabled";

/** Same character set the SDK accepts for source_id / key_id. */
export const SOURCE_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

export type SourceRow = {
  source_id: string;
  organization_id: string;
  name: string;
  kind: SourceKind;
  owner_contact: string | null;
  status: SourceStatus;
  last_seq: number;
  last_event_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type SourceKeyRow = {
  key_id: string;
  organization_id: string;
  source_id: string;
  public_key_b64: string;
  valid_from: Date;
  valid_to: Date | null;
  status: SourceKeyStatus;
  created_by: string | null;
  revoked_by: string | null;
  reason: string | null;
  created_at: Date;
};

export type SourceGapRow = {
  from_seq: number;
  to_seq: number;
  detected_at: Date;
};

export type RegistryEventRow = {
  id: string;
  source_id: string;
  key_id: string | null;
  action: RegistryAction;
  actor: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
};

export class RegistryError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "not_found"
      | "conflict"
      | "already_revoked",
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

type Db = pg.Pool | pg.PoolClient;

const SOURCE_COLUMNS = `source_id, organization_id, name, kind, owner_contact, status,
  last_seq::text AS last_seq, last_event_at, created_at, updated_at`;

type RawSource = Omit<SourceRow, "last_seq"> & { last_seq: string };

function toSource(row: RawSource): SourceRow {
  return { ...row, last_seq: Number(row.last_seq) };
}

/** Short, non-secret display form of a public key: first 8 + last 8 base64 chars. */
export function keyFingerprint(publicKeyB64: string): string {
  const k = publicKeyB64.trim();
  if (k.length <= 20) return k;
  return `${k.slice(0, 8)}…${k.slice(-8)}`;
}

/** Validates a standard-base64 32-byte Ed25519 public key. Returns the canonical form. */
export function normalizePublicKeyB64(input: string): string {
  const text = input.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new RegistryError(
      "invalid",
      "public_key_b64 must be standard base64 of a 32-byte Ed25519 public key",
    );
  }
  const bytes = Buffer.from(text, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== text) {
    throw new RegistryError(
      "invalid",
      "public_key_b64 must decode to exactly 32 bytes (Ed25519 public key)",
    );
  }
  return text;
}

export async function appendRegistryEvent(
  db: Db,
  input: {
    organization_id: string;
    source_id: string;
    key_id?: string | null;
    action: RegistryAction;
    actor?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO source_registry_event
       (organization_id, source_id, key_id, action, actor, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.organization_id,
      input.source_id,
      input.key_id ?? null,
      input.action,
      input.actor ?? null,
      JSON.stringify(input.detail ?? {}),
    ],
  );
}

export async function getSource(
  db: Db,
  organizationId: string,
  sourceId: string,
): Promise<SourceRow | null> {
  const r = await db.query<RawSource>(
    `SELECT ${SOURCE_COLUMNS} FROM source
     WHERE organization_id = $1 AND source_id = $2`,
    [organizationId, sourceId],
  );
  return r.rows[0] ? toSource(r.rows[0]) : null;
}

export async function listSources(
  db: Db,
  organizationId: string,
): Promise<SourceRow[]> {
  const r = await db.query<RawSource>(
    `SELECT ${SOURCE_COLUMNS} FROM source
     WHERE organization_id = $1
     ORDER BY created_at DESC, source_id`,
    [organizationId],
  );
  return r.rows.map(toSource);
}

export async function listSourceKeys(
  db: Db,
  organizationId: string,
  sourceId?: string,
): Promise<SourceKeyRow[]> {
  const r = await db.query<SourceKeyRow>(
    `SELECT key_id, organization_id, source_id, public_key_b64, valid_from, valid_to,
            status, created_by, revoked_by, reason, created_at
     FROM source_key
     WHERE organization_id = $1 AND ($2::text IS NULL OR source_id = $2)
     ORDER BY created_at DESC, key_id`,
    [organizationId, sourceId ?? null],
  );
  return r.rows;
}

export async function getSourceKey(
  db: Db,
  organizationId: string,
  keyId: string,
): Promise<SourceKeyRow | null> {
  const r = await db.query<SourceKeyRow>(
    `SELECT key_id, organization_id, source_id, public_key_b64, valid_from, valid_to,
            status, created_by, revoked_by, reason, created_at
     FROM source_key
     WHERE organization_id = $1 AND key_id = $2`,
    [organizationId, keyId],
  );
  return r.rows[0] ?? null;
}

/** Open (unresolved) sequence gaps, newest first. */
export async function listSequenceGaps(
  db: Db,
  organizationId: string,
  sourceId?: string,
  limit = 50,
): Promise<Array<SourceGapRow & { source_id: string }>> {
  const r = await db.query<{
    source_id: string;
    from_seq: string;
    to_seq: string;
    detected_at: Date;
  }>(
    `SELECT source_id, from_seq::text, to_seq::text, detected_at
     FROM source_sequence_gap
     WHERE organization_id = $1 AND ($2::text IS NULL OR source_id = $2)
     ORDER BY detected_at DESC, from_seq DESC
     LIMIT $3`,
    [organizationId, sourceId ?? null, limit],
  );
  return r.rows.map((g) => ({
    source_id: g.source_id,
    from_seq: Number(g.from_seq),
    to_seq: Number(g.to_seq),
    detected_at: g.detected_at,
  }));
}

export async function countSequenceGaps(
  db: Db,
  organizationId: string,
): Promise<Map<string, number>> {
  const r = await db.query<{ source_id: string; n: string }>(
    `SELECT source_id, count(*)::text AS n
     FROM source_sequence_gap WHERE organization_id = $1
     GROUP BY source_id`,
    [organizationId],
  );
  return new Map(r.rows.map((g) => [g.source_id, Number(g.n)]));
}

export async function listRegistryEvents(
  db: Db,
  organizationId: string,
  sourceId: string,
  limit = 200,
): Promise<RegistryEventRow[]> {
  const r = await db.query<RegistryEventRow>(
    `SELECT id, source_id, key_id, action, actor, detail, created_at
     FROM source_registry_event
     WHERE organization_id = $1 AND source_id = $2
     ORDER BY created_at DESC, id
     LIMIT $3`,
    [organizationId, sourceId, limit],
  );
  return r.rows;
}

function assertId(value: string, what: string): void {
  if (!SOURCE_ID_RE.test(value)) {
    throw new RegistryError(
      "invalid",
      `${what} must be 1-128 characters: letters, digits, '.', '_', ':' or '-'`,
    );
  }
}

async function inTransaction<T>(
  client: pg.PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

export type RegisterSourceInput = {
  organization_id: string;
  source_id: string;
  name: string;
  kind: string;
  owner_contact?: string | null;
  key_id: string;
  public_key_b64: string;
  valid_from?: Date;
  actor?: string | null;
};

/** Register a source together with its first key. */
export async function registerSource(
  client: pg.PoolClient,
  input: RegisterSourceInput,
): Promise<{ source: SourceRow; key: SourceKeyRow }> {
  assertId(input.source_id, "source_id");
  assertId(input.key_id, "key_id");
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new RegistryError("invalid", "name is required (120 characters or fewer)");
  }
  if (!(SOURCE_KINDS as readonly string[]).includes(input.kind)) {
    throw new RegistryError(
      "invalid",
      `kind must be one of: ${SOURCE_KINDS.join(", ")}`,
    );
  }
  const publicKey = normalizePublicKeyB64(input.public_key_b64);
  const validFrom = input.valid_from ?? new Date();

  try {
    return await inTransaction(client, async () => {
      await client.query(
        `INSERT INTO source (organization_id, source_id, name, kind, owner_contact)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.organization_id,
          input.source_id,
          name,
          input.kind,
          input.owner_contact?.trim() || null,
        ],
      );
      await client.query(
        `INSERT INTO source_key
           (organization_id, source_id, key_id, public_key_b64, valid_from, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.organization_id,
          input.source_id,
          input.key_id,
          publicKey,
          validFrom,
          input.actor ?? null,
        ],
      );
      await appendRegistryEvent(client, {
        organization_id: input.organization_id,
        source_id: input.source_id,
        action: "registered",
        actor: input.actor,
        detail: { name, kind: input.kind, owner_contact: input.owner_contact ?? null },
      });
      await appendRegistryEvent(client, {
        organization_id: input.organization_id,
        source_id: input.source_id,
        key_id: input.key_id,
        action: "key_added",
        actor: input.actor,
        detail: {
          fingerprint: keyFingerprint(publicKey),
          valid_from: validFrom.toISOString(),
        },
      });
      const source = (await getSource(client, input.organization_id, input.source_id))!;
      const key = (await getSourceKey(client, input.organization_id, input.key_id))!;
      return { source, key };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new RegistryError(
        "conflict",
        "A source or key with that id already exists in this organization",
      );
    }
    throw err;
  }
}

export type AddSourceKeyInput = {
  organization_id: string;
  source_id: string;
  key_id: string;
  public_key_b64: string;
  valid_from?: Date;
  /**
   * Retire the currently active keys of this source (status "rotated", valid_to = now).
   * Defaults to true unless the new key starts in the future.
   */
  retire_previous?: boolean;
  actor?: string | null;
};

/** Add a key to an existing source (rotation). */
export async function addSourceKey(
  client: pg.PoolClient,
  input: AddSourceKeyInput,
): Promise<{ key: SourceKeyRow; retired: string[] }> {
  assertId(input.key_id, "key_id");
  const publicKey = normalizePublicKeyB64(input.public_key_b64);
  const now = new Date();
  const validFrom = input.valid_from ?? now;
  const retirePrevious = input.retire_previous ?? validFrom.getTime() <= now.getTime();

  try {
    return await inTransaction(client, async () => {
      const src = await client.query(
        `SELECT 1 FROM source WHERE organization_id = $1 AND source_id = $2 FOR UPDATE`,
        [input.organization_id, input.source_id],
      );
      if (src.rowCount === 0) {
        throw new RegistryError("not_found", "Source not found");
      }
      await client.query(
        `INSERT INTO source_key
           (organization_id, source_id, key_id, public_key_b64, valid_from, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.organization_id,
          input.source_id,
          input.key_id,
          publicKey,
          validFrom,
          input.actor ?? null,
        ],
      );
      await appendRegistryEvent(client, {
        organization_id: input.organization_id,
        source_id: input.source_id,
        key_id: input.key_id,
        action: "key_added",
        actor: input.actor,
        detail: {
          fingerprint: keyFingerprint(publicKey),
          valid_from: validFrom.toISOString(),
        },
      });
      const retired: string[] = [];
      if (retirePrevious) {
        const r = await client.query<{ key_id: string }>(
          `UPDATE source_key
           SET status = 'rotated', valid_to = now()
           WHERE organization_id = $1 AND source_id = $2
             AND status = 'active' AND key_id <> $3
           RETURNING key_id`,
          [input.organization_id, input.source_id, input.key_id],
        );
        for (const row of r.rows) {
          retired.push(row.key_id);
          await appendRegistryEvent(client, {
            organization_id: input.organization_id,
            source_id: input.source_id,
            key_id: row.key_id,
            action: "key_rotated",
            actor: input.actor,
            detail: { replaced_by: input.key_id },
          });
        }
      }
      const key = (await getSourceKey(client, input.organization_id, input.key_id))!;
      return { key, retired };
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new RegistryError(
        "conflict",
        "A key with that id already exists in this organization",
      );
    }
    throw err;
  }
}

/** Revoke a key immediately; envelopes signed with it are refused from now on. */
export async function revokeSourceKey(
  client: pg.PoolClient,
  input: {
    organization_id: string;
    source_id: string;
    key_id: string;
    reason: string;
    actor?: string | null;
  },
): Promise<SourceKeyRow> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new RegistryError("invalid", "A reason is required to revoke a key");
  }
  return inTransaction(client, async () => {
    const existing = await client.query<{ status: SourceKeyStatus }>(
      `SELECT status FROM source_key
       WHERE organization_id = $1 AND source_id = $2 AND key_id = $3
       FOR UPDATE`,
      [input.organization_id, input.source_id, input.key_id],
    );
    if (!existing.rows[0]) {
      throw new RegistryError("not_found", "Key not found for this source");
    }
    if (existing.rows[0].status === "revoked") {
      throw new RegistryError("already_revoked", "Key is already revoked");
    }
    await client.query(
      `UPDATE source_key
       SET status = 'revoked', revoked_by = $4, reason = $5,
           valid_to = COALESCE(valid_to, now())
       WHERE organization_id = $1 AND source_id = $2 AND key_id = $3`,
      [
        input.organization_id,
        input.source_id,
        input.key_id,
        input.actor ?? null,
        reason,
      ],
    );
    await appendRegistryEvent(client, {
      organization_id: input.organization_id,
      source_id: input.source_id,
      key_id: input.key_id,
      action: "key_revoked",
      actor: input.actor,
      detail: { reason },
    });
    return (await getSourceKey(client, input.organization_id, input.key_id))!;
  });
}

/** Stop accepting any envelope from this source. */
export async function disableSource(
  client: pg.PoolClient,
  input: {
    organization_id: string;
    source_id: string;
    reason?: string;
    actor?: string | null;
  },
): Promise<SourceRow> {
  return inTransaction(client, async () => {
    const r = await client.query(
      `UPDATE source SET status = 'disabled', updated_at = now()
       WHERE organization_id = $1 AND source_id = $2`,
      [input.organization_id, input.source_id],
    );
    if (r.rowCount === 0) {
      throw new RegistryError("not_found", "Source not found");
    }
    await appendRegistryEvent(client, {
      organization_id: input.organization_id,
      source_id: input.source_id,
      action: "source_disabled",
      actor: input.actor,
      detail: input.reason ? { reason: input.reason } : {},
    });
    return (await getSource(client, input.organization_id, input.source_id))!;
  });
}

export async function organizationRequiresSignedEvents(
  db: Db,
  organizationId: string,
): Promise<boolean> {
  try {
    const r = await db.query<{ require_signed_events: boolean }>(
      `SELECT require_signed_events FROM organization WHERE organization_id = $1`,
      [organizationId],
    );
    return r.rows[0]?.require_signed_events === true;
  } catch (err) {
    // 42703 undefined_column: migration 006 not applied yet, so nothing is required.
    if ((err as { code?: string } | null)?.code === "42703") return false;
    throw err;
  }
}
