/**
 * Clock injection is test-only; production path always uses system time.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getClock,
  setClockForTests,
  systemClock,
  type Clock,
} from "../src/time/clock.js";
import { isEscalationDue } from "../src/bank/escalation.js";
import { delegationStatus } from "../src/bank/approval-delegate.js";

afterEach(() => {
  delete process.env.AEGIS_ENV;
  setClockForTests(null);
});

function fakeClock(ms: number): Clock {
  return {
    now: () => new Date(ms),
    nowMs: () => ms,
    nowIso: () => new Date(ms).toISOString(),
  };
}

describe("Clock", () => {
  it("defaults to system clock", () => {
    expect(getClock()).toBe(systemClock);
  });

  it("setClockForTests drives escalation due checks", () => {
    const created = new Date("2026-01-01T00:00:00.000Z");
    setClockForTests(fakeClock(created.getTime() + 119_000));
    expect(
      isEscalationDue(
        { escalate_after_ms: 120_000, escalate_to_role: "head_of_compliance" },
        created,
        getClock().now(),
      ),
    ).toBe(false);
    setClockForTests(fakeClock(created.getTime() + 120_000));
    expect(
      isEscalationDue(
        { escalate_after_ms: 120_000, escalate_to_role: "head_of_compliance" },
        created,
        getClock().now(),
      ),
    ).toBe(true);
  });

  it("setClockForTests drives delegation expiry", () => {
    const expires = new Date("2026-01-01T01:00:00.000Z");
    setClockForTests(fakeClock(expires.getTime() - 1));
    expect(delegationStatus({ expires_at: expires, revoked_at: null }, getClock().now())).toBe(
      "active",
    );
    setClockForTests(fakeClock(expires.getTime() + 1));
    expect(delegationStatus({ expires_at: expires, revoked_at: null }, getClock().now())).toBe(
      "expired",
    );
  });

  it("refuses setClockForTests when AEGIS_ENV=production", () => {
    process.env.AEGIS_ENV = "production";
    expect(() => setClockForTests(fakeClock(0))).toThrow(/production/);
  });
});
