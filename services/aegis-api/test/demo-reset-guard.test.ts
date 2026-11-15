import { describe, expect, it } from "vitest";
import { assertDemoMode, DemoClockError } from "../src/bank/demo-clock.js";

describe("demo reset / clock production guard", () => {
  it("refuses when AEGIS_DEMO_MODE is not set", () => {
    const prev = process.env.AEGIS_DEMO_MODE;
    delete process.env.AEGIS_DEMO_MODE;
    try {
      expect(() => assertDemoMode("demo reset")).toThrow(DemoClockError);
    } finally {
      if (prev === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prev;
    }
  });

  it("allows when AEGIS_DEMO_MODE=true and DB is not named production", () => {
    const prevMode = process.env.AEGIS_DEMO_MODE;
    const prevDb = process.env.DATABASE_URL;
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.DATABASE_URL = "postgresql://localhost/aegis_demo";
    try {
      expect(() => assertDemoMode("demo reset")).not.toThrow();
    } finally {
      if (prevMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prevMode;
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
    }
  });
});
