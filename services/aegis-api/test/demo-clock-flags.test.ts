import { afterEach, describe, expect, it } from "vitest";
import {
  isDemoClockActive,
  resetDemoClock,
  setDemoClock,
} from "../src/bank/demo-clock.js";
import { buildReceiptBody } from "../src/forensic/receipt.js";

describe("demo_clock flags", () => {
  afterEach(() => {
    resetDemoClock();
    delete process.env.AEGIS_DEMO_MODE;
    delete process.env.AEGIS_DEMO_CLOCK;
  });

  it("marks receipt body flags.demo_clock when demo clock is active", () => {
    process.env.AEGIS_DEMO_MODE = "true";
    setDemoClock(0);
    expect(isDemoClockActive()).toBe(true);

    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000001",
      seq: 1,
      prev_hash: null,
      case_id: "c1",
      decision_id: "d1",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: "e1", event_hash: "sha256:x", sequence_num: 1 },
      ],
      key_id: "key_1",
      flags: isDemoClockActive() ? { demo_clock: true } : undefined,
    });

    expect(body.flags?.demo_clock).toBe(true);
  });

  it("omits demo_clock when clock inactive", () => {
    expect(isDemoClockActive()).toBe(false);
    const body = buildReceiptBody({
      organization_id: "00000000-0000-0000-0000-000000000001",
      seq: 1,
      prev_hash: null,
      case_id: "c1",
      decision_id: "d1",
      outcome: "allow",
      mode: "enforce",
      matched_rules: [],
      sealed_events: [
        { event_id: "e1", event_hash: "sha256:x", sequence_num: 1 },
      ],
      key_id: "key_1",
      flags: isDemoClockActive() ? { demo_clock: true } : undefined,
    });
    expect(body.flags?.demo_clock).toBeUndefined();
  });
});
