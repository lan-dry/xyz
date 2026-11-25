import { afterEach, describe, expect, it } from "vitest";
import type pg from "pg";
import {
  enforceOrgIngestControls,
  enforceSandboxQuota,
  refuseExportRateLimit,
  refuseOrgIngestRateLimit,
} from "../src/limits/tenant-limits.js";

const originalEnv = new Map<string, string | undefined>();

function setEnv(name: string, value: string): void {
  if (!originalEnv.has(name)) originalEnv.set(name, process.env[name]);
  process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  originalEnv.clear();
});

function fakeDb(handlers: {
  org?: Record<string, unknown> | null;
  usage?: { events_today: string; storage_bytes: string };
  throwCode?: string;
  onQuery?: (sql: string) => void;
}): pg.Pool {
  return {
    query: async (sql: string) => {
      handlers.onQuery?.(sql);
      if (handlers.throwCode && sql.includes("FROM organization")) {
        const err = new Error("column does not exist") as Error & { code: string };
        err.code = handlers.throwCode;
        throw err;
      }
      if (sql.includes("FROM organization")) {
        return { rows: handlers.org ? [handlers.org] : [] };
      }
      if (sql.includes("events_today")) {
        return {
          rows: [handlers.usage ?? { events_today: "0", storage_bytes: "0" }],
        };
      }
      throw new Error(`unexpected sql: ${sql}`);
    },
  } as unknown as pg.Pool;
}

describe("org ingest rate limit", () => {
  it("returns 429 with Retry-After after the per-org ceiling", async () => {
    setEnv("INGEST_ORG_RATE_LIMIT_PER_MIN", "2");
    const org = `org-ingest-${crypto.randomUUID()}`;
    expect(refuseOrgIngestRateLimit(org)).toBeNull();
    expect(refuseOrgIngestRateLimit(org)).toBeNull();

    const blocked = refuseOrgIngestRateLimit(org);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
    const body = (await blocked!.json()) as {
      code: string;
      message: string;
      retry_after_sec: number;
    };
    expect(body.code).toBe("rate_limited");
    expect(body.message).toMatch(/rate limit/i);
    expect(body.retry_after_sec).toBeGreaterThan(0);

    expect(refuseOrgIngestRateLimit(`org-other-${crypto.randomUUID()}`)).toBeNull();
  });

  it("returns the org 429 before a sandbox quota lookup", async () => {
    setEnv("INGEST_ORG_RATE_LIMIT_PER_MIN", "1");
    const org = `org-ctl-${crypto.randomUUID()}`;
    let queries = 0;
    const db = fakeDb({
      org: {
        tenant_kind: "sandbox",
        is_test: false,
        event_quota_daily: 10,
        storage_quota_mb: 512,
      },
      onQuery: () => {
        queries += 1;
      },
    });
    expect(await enforceOrgIngestControls(db, org)).toBeNull();
    const lookedUp = queries;
    const blocked = await enforceOrgIngestControls(db, org);
    expect(blocked?.status).toBe(429);
    expect(queries).toBe(lookedUp);
  });
});

describe("sandbox quotas", () => {
  it("refuses a sandbox that has used its daily event quota", async () => {
    const res = await enforceSandboxQuota(
      fakeDb({
        org: {
          tenant_kind: "sandbox",
          is_test: false,
          event_quota_daily: 2,
          storage_quota_mb: 512,
        },
        usage: { events_today: "2", storage_bytes: "100" },
      }),
      "org-sandbox",
    );
    expect(res?.status).toBe(402);
    const body = (await res!.json()) as {
      code: string;
      message: string;
      events_today: number;
      event_quota_daily: number;
    };
    expect(body.code).toBe("sandbox_event_quota");
    expect(body.message).toMatch(/daily event quota/);
    expect(body.events_today).toBe(2);
    expect(body.event_quota_daily).toBe(2);
  });

  it("refuses an is_test tenant the same way", async () => {
    const res = await enforceSandboxQuota(
      fakeDb({
        org: {
          tenant_kind: "real",
          is_test: true,
          event_quota_daily: 1,
          storage_quota_mb: null,
        },
        usage: { events_today: "1", storage_bytes: "0" },
      }),
      "org-test",
    );
    expect(res?.status).toBe(402);
    expect(((await res!.json()) as { code: string }).code).toBe("sandbox_event_quota");
  });

  it("allows a sandbox still under the daily quota", async () => {
    const res = await enforceSandboxQuota(
      fakeDb({
        org: {
          tenant_kind: "sandbox",
          is_test: false,
          event_quota_daily: 5000,
          storage_quota_mb: 512,
        },
        usage: { events_today: "3", storage_bytes: "1000" },
      }),
      "org-sandbox-ok",
    );
    expect(res).toBeNull();
  });

  it("does not hard-refuse a real tenant", async () => {
    let usageQueries = 0;
    const res = await enforceSandboxQuota(
      fakeDb({
        org: {
          tenant_kind: "real",
          is_test: false,
          event_quota_daily: 1,
          storage_quota_mb: 1,
        },
        usage: { events_today: "999", storage_bytes: String(1024 * 1024 * 1024) },
        onQuery: (sql) => {
          if (sql.includes("events_today")) usageQueries += 1;
        },
      }),
      "org-real",
    );
    expect(res).toBeNull();
    expect(usageQueries).toBe(0);
  });

  it("refuses a sandbox over its storage quota", async () => {
    const res = await enforceSandboxQuota(
      fakeDb({
        org: {
          tenant_kind: "sandbox",
          is_test: false,
          event_quota_daily: 5000,
          storage_quota_mb: 1,
        },
        usage: { events_today: "1", storage_bytes: String(2 * 1024 * 1024) },
      }),
      "org-storage",
    );
    expect(res?.status).toBe(402);
    const body = (await res!.json()) as { code: string; message: string };
    expect(body.code).toBe("sandbox_storage_quota");
    expect(body.message).toMatch(/storage quota/);
  });

  it("does not block ingest when quota columns are not migrated yet", async () => {
    const res = await enforceSandboxQuota(fakeDb({ throwCode: "42703" }), "org-old");
    expect(res).toBeNull();
  });
});

describe("export rate limit", () => {
  it("returns 429 with Retry-After after the hourly export ceiling", async () => {
    setEnv("EXPORT_RATE_LIMIT_PER_HOUR", "2");
    const org = `org-export-${crypto.randomUUID()}`;
    expect(refuseExportRateLimit(org)).toBeNull();
    expect(refuseExportRateLimit(org)).toBeNull();
    const blocked = refuseExportRateLimit(org);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
    const body = (await blocked!.json()) as { code: string };
    expect(body.code).toBe("rate_limited");
  });
});
