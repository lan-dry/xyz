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
    const prevNode = process.env.NODE_ENV;
    const prevAegis = process.env.AEGIS_ENV;
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.DATABASE_URL = "postgresql://localhost/aegis_demo";
    delete process.env.NODE_ENV;
    delete process.env.AEGIS_ENV;
    try {
      expect(() => assertDemoMode("demo reset")).not.toThrow();
    } finally {
      if (prevMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prevMode;
      if (prevDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevDb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevAegis === undefined) delete process.env.AEGIS_ENV;
      else process.env.AEGIS_ENV = prevAegis;
    }
  });

  it("refuses when NODE_ENV is production even if AEGIS_DEMO_MODE=true", () => {
    const prevMode = process.env.AEGIS_DEMO_MODE;
    const prevNode = process.env.NODE_ENV;
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertDemoMode("demo scenarios")).toThrow(DemoClockError);
    } finally {
      if (prevMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prevMode;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});
