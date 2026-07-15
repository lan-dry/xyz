import { randomUUID } from "node:crypto";
import type pg from "pg";

export type SiemDestinationRow = {
  dest_id: string;
  organization_id: string;
  provider: string;
  otel_endpoint: string | null;
  auth_config: Record<string, unknown> | null;
  status: string;
  last_flushed_at: Date | null;
  created_at: Date;
};

const PROVIDERS = ["splunk", "datadog", "sentinel"] as const;
export type SiemProvider = (typeof PROVIDERS)[number];

export function isSiemProvider(value: string): value is SiemProvider {
  return (PROVIDERS as readonly string[]).includes(value);
}

export async function listSiemDestinations(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<SiemDestinationRow[]> {
  const result = await client.query<SiemDestinationRow>(
    `SELECT dest_id, organization_id, provider, otel_endpoint, auth_config, status,
            last_flushed_at, created_at
     FROM siem_destination
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function createSiemDestination(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    provider: SiemProvider;
    otelEndpoint: string;
    destId?: string;
  },
): Promise<SiemDestinationRow> {
  const destId = input.destId?.trim() || `siem_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const result = await client.query<SiemDestinationRow>(
    `INSERT INTO siem_destination (dest_id, organization_id, provider, otel_endpoint, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING dest_id, organization_id, provider, otel_endpoint, auth_config, status,
               last_flushed_at, created_at`,
    [destId, input.organizationId, input.provider, input.otelEndpoint.trim()],
  );
  return result.rows[0]!;
}

export async function updateSiemDestination(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  destId: string,
  patch: { status?: "active" | "paused"; otelEndpoint?: string },
): Promise<SiemDestinationRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [organizationId, destId];
  if (patch.status) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.otelEndpoint !== undefined) {
    params.push(patch.otelEndpoint.trim());
    sets.push(`otel_endpoint = $${params.length}`);
  }
  if (sets.length === 0) {
    const existing = await client.query<SiemDestinationRow>(
      `SELECT dest_id, organization_id, provider, otel_endpoint, auth_config, status,
              last_flushed_at, created_at
       FROM siem_destination WHERE organization_id = $1 AND dest_id = $2`,
      [organizationId, destId],
    );
    return existing.rows[0] ?? null;
  }
  const result = await client.query<SiemDestinationRow>(
    `UPDATE siem_destination SET ${sets.join(", ")}
     WHERE organization_id = $1 AND dest_id = $2
     RETURNING dest_id, organization_id, provider, otel_endpoint, auth_config, status,
               last_flushed_at, created_at`,
    params,
  );
  return result.rows[0] ?? null;
}
