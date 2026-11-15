import { afterEach, describe, expect, it } from "vitest";
import {
  demoApprovalPassword,
  seedDemoApprovalActors,
} from "../src/demo/seed-approval-actors.js";

describe("demo approval seed guards", () => {
  const prevDemo = process.env.AEGIS_DEMO_MODE;
  const prevNode = process.env.NODE_ENV;
  const prevAegis = process.env.AEGIS_ENV;

  afterEach(() => {
    if (prevDemo === undefined) delete process.env.AEGIS_DEMO_MODE;
    else process.env.AEGIS_DEMO_MODE = prevDemo;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevAegis === undefined) delete process.env.AEGIS_ENV;
    else process.env.AEGIS_ENV = prevAegis;
  });

  it("refuses demoApprovalPassword when demo mode is off", () => {
    delete process.env.AEGIS_DEMO_MODE;
    delete process.env.NODE_ENV;
    delete process.env.AEGIS_ENV;
    expect(() => demoApprovalPassword()).toThrow(/refused|DEMO_MODE/i);
  });

  it("refuses demoApprovalPassword when NODE_ENV=production", () => {
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "production";
    expect(() => demoApprovalPassword()).toThrow(/refused|production/i);
  });

  it("refuses seedDemoApprovalActors when demo mode is off", async () => {
    delete process.env.AEGIS_DEMO_MODE;
    delete process.env.NODE_ENV;
    await expect(
      seedDemoApprovalActors(
        {
          query: async () => {
            throw new Error("should not query");
          },
        } as never,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toThrow(/refused|DEMO_MODE/i);
  });
});
