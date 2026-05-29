import { describe, expect, it } from "vitest";
import { backfillOrganizationUsageMonthly } from "../src/plans.js";

describe("backfillOrganizationUsageMonthly", () => {
  it("is exported for billing cron", () => {
    expect(typeof backfillOrganizationUsageMonthly).toBe("function");
  });
});
