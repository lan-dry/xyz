import { describe, expect, it } from "vitest";
import {
  assertDemoMode,
  assertDisableTriggersRestoreAllowed,
  DemoClockError,
} from "../src/bank/demo-clock.js";

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
      expect(() => assertDemoMode("demo reset")).toThrow(DemoClockError);
    } finally {
      if (prevMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prevMode;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("refuses when AEGIS_ENV is production even if AEGIS_DEMO_MODE=true", () => {
    const prevMode = process.env.AEGIS_DEMO_MODE;
    const prevAegis = process.env.AEGIS_ENV;
    const prevNode = process.env.NODE_ENV;
    process.env.AEGIS_DEMO_MODE = "true";
    process.env.AEGIS_ENV = "production";
    delete process.env.NODE_ENV;
    try {
      expect(() => assertDemoMode("demo reset")).toThrow(DemoClockError);
    } finally {
      if (prevMode === undefined) delete process.env.AEGIS_DEMO_MODE;
      else process.env.AEGIS_DEMO_MODE = prevMode;
      if (prevAegis === undefined) delete process.env.AEGIS_ENV;
      else process.env.AEGIS_ENV = prevAegis;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});

describe("pg_restore --disable-triggers production guard", () => {
  function withEnv(
    patch: Record<string, string | undefined>,
    fn: () => void,
  ): void {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(patch)) {
      prev[k] = process.env[k];
      const v = patch[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it("refuses when demo mode is off", () => {
    withEnv(
      {
        AEGIS_DEMO_MODE: undefined,
        NODE_ENV: "development",
        AEGIS_ENV: undefined,
        DATABASE_URL: "postgresql://localhost/aegis_demo",
      },
      () => {
        expect(() => assertDisableTriggersRestoreAllowed()).toThrow(
          DemoClockError,
        );
      },
    );
  });

  it("refuses when NODE_ENV is production (even with demo mode on)", () => {
    withEnv(
      {
        AEGIS_DEMO_MODE: "true",
        NODE_ENV: "production",
        AEGIS_ENV: undefined,
        DATABASE_URL: "postgresql://localhost/aegis_demo",
      },
      () => {
        expect(() => assertDisableTriggersRestoreAllowed()).toThrow(
          DemoClockError,
        );
      },
    );
  });

  it("refuses when AEGIS_ENV is production and demo mode is off", () => {
    withEnv(
      {
        AEGIS_DEMO_MODE: "false",
        NODE_ENV: undefined,
        AEGIS_ENV: "production",
        DATABASE_URL: "postgresql://localhost/aegis_demo",
      },
      () => {
        expect(() => assertDisableTriggersRestoreAllowed()).toThrow(
          DemoClockError,
        );
      },
    );
  });

  it("allows when AEGIS_DEMO_MODE=true and not production", () => {
    withEnv(
      {
        AEGIS_DEMO_MODE: "true",
        NODE_ENV: "development",
        AEGIS_ENV: "demo",
        DATABASE_URL: "postgresql://localhost/aegis_demo",
      },
      () => {
        expect(() => assertDisableTriggersRestoreAllowed()).not.toThrow();
      },
    );
  });
});
