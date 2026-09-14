import { describe, expect, it } from "vitest";
import { PlanLimitError } from "@salanor/platform-auth";

describe("PlanLimitError", () => {
  it("exposes http status for ingest limits", () => {
    const err = new PlanLimitError("events_limit", "cap reached", 402);
    expect(err.httpStatus).toBe(402);
    expect(err.code).toBe("events_limit");
  });
});
