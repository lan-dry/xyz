export type SpanGroupEvent = {
  event_id: string;
  sequence_num: number;
  action_kind: string;
  policy_decision: string;
  tool_name: string | null;
  payload: unknown;
};

export type EventSpanGroup = {
  span_id: string;
  label: string;
  events: SpanGroupEvent[];
};

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return null;
}

function spanIdFromEvent(event: SpanGroupEvent): string | null {
  const p = payloadRecord(event.payload);
  const id = p?.span_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function spanLabelFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  const label = payload.span_label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function defaultLabel(event: SpanGroupEvent): string {
  if (event.tool_name) {
    return event.tool_name;
  }
  return event.action_kind.replace(/_/g, " ");
}

/** Group trace events by payload.span_id (falls back to sequential unlabeled steps). */
export function groupEventsIntoSpans(events: SpanGroupEvent[]): EventSpanGroup[] {
  if (events.length === 0) {
    return [];
  }

  const groups: EventSpanGroup[] = [];
  let current: EventSpanGroup | null = null;

  for (const event of events) {
    const spanId = spanIdFromEvent(event);
    const payload = payloadRecord(event.payload);
    const label = spanLabelFromPayload(payload) ?? defaultLabel(event);

    if (!spanId) {
      if (!current || current.span_id !== "__ungrouped__") {
        current = { span_id: "__ungrouped__", label: "Ungrouped steps", events: [] };
        groups.push(current);
      }
      current.events.push(event);
      continue;
    }

    if (!current || current.span_id !== spanId) {
      current = {
        span_id: spanId,
        label,
        events: [],
      };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
}
