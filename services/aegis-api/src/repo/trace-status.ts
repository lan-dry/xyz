import type pg from "pg";

export async function completeTrace(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<void> {
  await client.query(
    `UPDATE trace
     SET status = 'completed', ended_at = now()
     WHERE organization_id = $1 AND trace_id = $2 AND status IN ('running', 'blocked')`,
    [organizationId, traceId],
  );
}

export async function getTraceStatus(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  traceId: string,
): Promise<string | null> {
  const result = await client.query<{ status: string }>(
    `SELECT status FROM trace WHERE organization_id = $1 AND trace_id = $2`,
    [organizationId, traceId],
  );
  return result.rows[0]?.status ?? null;
}
