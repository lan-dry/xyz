import type { ApsEvent } from "@salanor/aegis";
import type pg from "pg";
import { buildOtlpLogsPayload } from "./otel-payload.js";

export type SiemDestinationRow = {
  dest_id: string;
  organization_id: string;
  provider: string;
  otel_endpoint: string | null;
  status: string;
};

export async function listActiveSiemDestinations(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<SiemDestinationRow[]> {
  const result = await client.query<SiemDestinationRow>(
    `SELECT dest_id, organization_id, provider, otel_endpoint, status
     FROM siem_destination
     WHERE organization_id = $1 AND status = 'active' AND otel_endpoint IS NOT NULL`,
    [organizationId],
  );
  return result.rows;
}

export async function postOtlpLogs(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = endpoint.endsWith("/v1/logs")
    ? endpoint
    : `${endpoint.replace(/\/$/, "")}/v1/logs`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SIEM export failed (${response.status}): ${text}`);
  }
}

export async function exportEventToSiemDestinations(
  client: pg.Pool | pg.PoolClient,
  event: ApsEvent,
): Promise<{ exported: number; dest_ids: string[] }> {
  const destinations = await listActiveSiemDestinations(
    client,
    event.organization_id,
  );
  if (destinations.length === 0) {
    return { exported: 0, dest_ids: [] };
  }

  const payload = buildOtlpLogsPayload(event);
  const destIds: string[] = [];

  for (const dest of destinations) {
    if (!dest.otel_endpoint) continue;
    await postOtlpLogs(dest.otel_endpoint, payload);
    destIds.push(dest.dest_id);
    await client.query(
      `UPDATE siem_destination SET last_flushed_at = now() WHERE dest_id = $1`,
      [dest.dest_id],
    );
  }

  return { exported: destIds.length, dest_ids: destIds };
}
