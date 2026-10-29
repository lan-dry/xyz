import { describe, expect, it } from "vitest";
import {
  endpointAcceptsEvent,
  isWebhookEventType,
  WEBHOOK_EVENT_TYPES,
} from "../src/webhooks/catalog.js";

describe("webhook catalog", () => {
  it("lists Phase 6 event types", () => {
    expect(WEBHOOK_EVENT_TYPES).toContain("approval.decided");
    expect(WEBHOOK_EVENT_TYPES.length).toBe(5);
  });

  it("filters endpoints by events_filter", () => {
    expect(isWebhookEventType("approval.decided")).toBe(true);
    expect(isWebhookEventType("unknown")).toBe(false);
    expect(endpointAcceptsEvent(null, "approval.decided")).toBe(true);
    expect(
      endpointAcceptsEvent(["approval.requested"], "approval.decided"),
    ).toBe(false);
    expect(
      endpointAcceptsEvent(["approval.decided"], "approval.decided"),
    ).toBe(true);
  });
});
