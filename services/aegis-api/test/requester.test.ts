import { describe, expect, it } from "vitest";
import { extractRequester } from "../src/bank/requester.js";

describe("extractRequester", () => {
  it("formats officer name · role from attributes", () => {
    const r = extractRequester({
      amount: 1,
      requester_email: "officer@demo.test",
      requester_name: "Patience Ingabire",
      requester_role: "credit_officer",
      officer_id: "OFF-1042",
    });
    expect(r.label).toBe("Patience Ingabire · Credit Officer");
    expect(r.email).toBe("officer@demo.test");
    expect(r.officer_id).toBe("OFF-1042");
  });

  it("reads nested APS payload.attributes", () => {
    const r = extractRequester({
      case_id: "c1",
      attributes: {
        requester_name: "Jean Mutabazi",
        requester_role: "credit_manager",
        requester_email: "manager@demo.test",
      },
    });
    expect(r.label).toBe("Jean Mutabazi · Credit Manager");
    expect(r.email).toBe("manager@demo.test");
  });

  it("falls back to system account · officer id", () => {
    const r = extractRequester({
      system_account: "core-banking",
      officer_id: "OFF-9",
    });
    expect(r.label).toBe("core-banking · OFF-9");
    expect(r.officer_id).toBe("OFF-9");
  });
});
