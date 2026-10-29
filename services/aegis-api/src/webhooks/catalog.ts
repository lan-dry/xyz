/** Outbound webhook event types (Phase 6 catalog). */
export const WEBHOOK_EVENT_TYPES = [
  "approval.requested",
  "approval.decided",
  "policy.activated",
  "agent.suspended",
  "event.denied",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export function endpointAcceptsEvent(
  eventsFilter: unknown,
  eventType: WebhookEventType,
): boolean {
  if (eventsFilter == null) {
    return true;
  }
  if (!Array.isArray(eventsFilter)) {
    return true;
  }
  if (eventsFilter.length === 0) {
    return true;
  }
  return eventsFilter.some(
    (e) => typeof e === "string" && e === eventType,
  );
}
