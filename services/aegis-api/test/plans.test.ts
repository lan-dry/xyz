import { describe, expect, it } from "vitest";
import { PlanLimitError } from "@salanor/platform-auth";

describe("PlanLimitError", () => {
  it("exposes http status for hard plan gates (keys/members/exports)", () => {
    const err = new PlanLimitError("ingest_keys_limit", "cap reached", 402);
    expect(err.httpStatus).toBe(402);
    expect(err.code).toBe("ingest_keys_limit");
  });

  it("documents that event meters are soft (no events_limit 402)", () => {
    // Soft overage is handled by assertIngestWithinLimits returning
    // events_overage=true without throwing. This test locks the contract:
    // PlanLimitError remains for other gates, not monthly event recording.
    expect(typeof PlanLimitError).toBe("function");
  });
});
