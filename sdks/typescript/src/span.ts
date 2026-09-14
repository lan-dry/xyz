import { randomUUID } from "node:crypto";

export function newSpanId(): string {
  return `spn_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function spanPayload(
  spanId: string,
  label?: string,
): Record<string, unknown> {
  return {
    span_id: spanId,
    ...(label ? { span_label: label } : {}),
  };
}

export function mergeSpanPayload(
  spanId: string,
  label: string | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    ...spanPayload(spanId, label),
  };
}
