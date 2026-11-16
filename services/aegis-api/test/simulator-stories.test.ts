import { describe, expect, it } from "vitest";
import {
  getSimulatorStory,
  SIMULATOR_STORIES,
  WITHIN_LIMIT_AMOUNT_RWF,
} from "../src/demo/simulator-stories.js";

describe("simulator stories", () => {
  it("aligns the within-limit loan to RWF 1,200,000", () => {
    const s = getSimulatorStory("loan_within_limit")!;
    expect(WITHIN_LIMIT_AMOUNT_RWF).toBe(1_200_000);
    expect(s.attributes.amount).toBe(1_200_000);
    expect(s.title).toBe("Loan RWF 1,200,000 within officer limit");
    expect(s.expect).toBe("allow");
  });

  it("covers the bank-ready edge stories, each with an expected outcome", () => {
    for (const id of [
      "sanctions_pep_stop",
      "payment_callback_unverified",
      "escalation_time_limit",
      "delegate_inside_window",
      "delegate_outside_window",
      "unreachable_replayed",
    ]) {
      const s = getSimulatorStory(id);
      expect(s, id).toBeDefined();
      expect(["allow", "hold", "stop"]).toContain(s!.expect);
      expect(s!.expect_detail?.length, `${id} expect_detail`).toBeGreaterThan(0);
    }
    expect(getSimulatorStory("sanctions_pep_stop")!.expect).toBe("stop");
  });

  it("has unique ids and no raw keys in titles", () => {
    const ids = SIMULATOR_STORIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SIMULATOR_STORIES) {
      expect(s.title).not.toMatch(/governed\.action|policy_decision|pol_/);
    }
  });
});
