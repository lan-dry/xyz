import { describe, expect, it } from "vitest";
import {
  buildHoldNotification,
  clearNotificationDeliveryLog,
  deliverHoldNotification,
  getNotificationDeliveryLog,
} from "../src/bank/notify-approvers.js";

describe("approver notifications", () => {
  it("builds safe hold content without sensitive fields", () => {
    const n = buildHoldNotification({
      case_id: "c1",
      required_roles: ["claims_supervisor"],
      rule_ids: ["CLM-02"],
      console_base_url: "https://console.example.test",
    });
    expect(n.summary).not.toMatch(/national_id|ssn/i);
    expect(n.approval_url).toContain("/approvals");
    expect(n.approval_url).toContain("case=c1");
  });

  it("retries with backoff and records delivery log", async () => {
    clearNotificationDeliveryLog();
    let fails = 2;
    const attempts = await deliverHoldNotification(
      buildHoldNotification({
        case_id: "c2",
        required_roles: ["credit_manager"],
        rule_ids: ["AUTH-RL"],
      }),
      [{ channel: "webhook", target: "https://hooks.example.test/aegis" }],
      {
        maxAttempts: 3,
        send: async () => {
          if (fails > 0) {
            fails -= 1;
            throw new Error("unreachable");
          }
        },
      },
    );
    expect(attempts.some((a) => a.status === "sent")).toBe(true);
    expect(getNotificationDeliveryLog().length).toBeGreaterThan(0);
    expect(getNotificationDeliveryLog()[0]!.target).toMatch(/^sha256:/);
  });
});
