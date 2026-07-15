import type { ApsEvent } from "@salanor/aegis";
import type pg from "pg";

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

export function resolveSpanId(event: ApsEvent): string | null {
  const top = (event as ApsEvent & { span_id?: string }).span_id;
  if (typeof top === "string" && top.trim()) {
    return top.trim();
  }
  const p = payloadRecord(event.payload);
  const fromPayload = p?.span_id;
  return typeof fromPayload === "string" && fromPayload.trim()
    ? fromPayload.trim()
    : null;
}

export function resolveParentSpanId(event: ApsEvent): string | null {
  const top = (event as ApsEvent & { parent_span_id?: string }).parent_span_id;
  if (typeof top === "string" && top.trim()) {
    return top.trim();
  }
  const p = payloadRecord(event.payload);
  const fromPayload = p?.parent_span_id;
  return typeof fromPayload === "string" && fromPayload.trim()
    ? fromPayload.trim()
    : null;
}

export function resolveSpanLabel(event: ApsEvent): string | null {
  const p = payloadRecord(event.payload);
  const label = p?.span_label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

/** Upsert span row when an event references span_id (formal span hierarchy). */
export async function ensureSpanForEvent(
  client: pg.PoolClient,
  event: ApsEvent,
): Promise<string | null> {
  const spanId = resolveSpanId(event);
  if (!spanId) {
    return null;
  }

  const parentSpanId = resolveParentSpanId(event);
  const label = resolveSpanLabel(event) ?? event.tool_name ?? event.action_kind;

  await client.query(
    `INSERT INTO span (
       span_id, organization_id, trace_id, parent_span_id, label, status, started_at
     ) VALUES ($1, $2, $3, $4, $5, 'open', $6::timestamptz)
     ON CONFLICT (span_id) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, span.label),
       parent_span_id = COALESCE(EXCLUDED.parent_span_id, span.parent_span_id)`,
    [
      spanId,
      event.organization_id,
      event.trace_id,
      parentSpanId,
      label,
      event.emitted_at,
    ],
  );

  if (
    event.action_kind === "tool_call" &&
    event.tool_name?.endsWith(".end")
  ) {
    await client.query(
      `UPDATE span SET status = 'closed', ended_at = $3::timestamptz
       WHERE span_id = $1 AND organization_id = $2`,
      [spanId, event.organization_id, event.emitted_at],
    );
  }

  return spanId;
}
