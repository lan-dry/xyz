import { describe, expect, it } from "vitest";
import { recordPolicyPublishApproval } from "../src/bank/dual-publish.js";

describe("dual publish helper (unit contract)", () => {
  it("exports recordPolicyPublishApproval", () => {
    expect(typeof recordPolicyPublishApproval).toBe("function");
  });
});
