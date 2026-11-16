import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReadiness,
  resetReadinessCachesForTests,
  type ReadinessDeps,
} from "../src/health/readiness.js";

const NOW = Date.parse("2026-11-16T06:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);
const KMS_ARN =
  "arn:aws:kms:eu-west-1:111122223333:key/11111111-2222-3333-4444-555555555555";

function deps(over: Partial<ReadinessDeps> & { env?: Record<string, string> } = {}): ReadinessDeps {
  return {
    now: () => NOW,
    pingDatabase: async () => ({ ok: true }),
    queryWorkers: async () => [
      { worker_name: "witness", status: "ok", started_at: minutesAgo(2) },
      { worker_name: "housekeeping", status: "ok", started_at: minutesAgo(60) },
      { worker_name: "compliance", status: "ok", started_at: minutesAgo(60) },
    ],
    queryLastBatchAt: async () => minutesAgo(3),
    queryPendingTimestamps: async () => 0,
    probeTsa: async () => true,
    probeKms: async () => true,
    ...over,
    env: {
      DATABASE_URL: "postgresql://u:p@db/aegis",
      AEGIS_ENV: "production",
      AEGIS_RECEIPT_KMS_KEY_ID: KMS_ARN,
      AEGIS_RECEIPT_KEY_ID: "receipt_prod_2026",
      AEGIS_TSA_URL: "http://timestamp.sectigo.com",
      ...(over.env ?? {}),
    },
  };
}

type Body = {
  status: string;
  checks: {
    database: { ok: boolean };
    witness: Record<string, unknown>;
    tsa: Record<string, unknown>;
    signing_key: Record<string, unknown>;
  };
  warnings?: string[];
  reason?: string;
};

beforeEach(() => resetReadinessCachesForTests());

describe("/ready", () => {
  it("reports database, witness, TSA and signing key when everything is up", async () => {
    const { httpStatus, body } = await buildReadiness(deps());
    const b = body as Body;
    expect(httpStatus).toBe(200);
    expect(b.status).toBe("ready");
    expect(b.checks.database.ok).toBe(true);
    expect(b.checks.witness).toMatchObject({
      configured: true,
      ok: true,
      last_run_age_minutes: 2,
      last_batch_age_minutes: 3,
    });
    expect(b.checks.tsa).toMatchObject({
      configured: true,
      authority: "Sectigo",
      reachable: true,
      pending_timestamps: 0,
    });
    expect(b.checks.signing_key).toMatchObject({
      configured: true,
      custody: "kms",
      key_id: "receipt_prod_2026",
      reachable: true,
      ok: true,
    });
    expect(b.warnings).toBeUndefined();
  });

  it("never leaks the KMS ARN, account id or TSA URL", async () => {
    const { body } = await buildReadiness(deps());
    const text = JSON.stringify(body);
    expect(text).not.toContain("111122223333");
    expect(text).not.toContain("arn:aws");
    expect(text).not.toContain("timestamp.sectigo.com");
  });

  it("503 when the database is down, still reporting the signing key", async () => {
    const { httpStatus, body } = await buildReadiness(
      deps({ pingDatabase: async () => ({ ok: false }) }),
    );
    expect(httpStatus).toBe(503);
    expect((body as Body).reason).toBe("database_unavailable");
    expect((body as Body).checks.database.ok).toBe(false);
    expect((body as Body).checks.signing_key.custody).toBe("kms");
  });

  it("503 when the witness heartbeat is stale", async () => {
    const { httpStatus, body } = await buildReadiness(
      deps({
        queryWorkers: async () => [
          { worker_name: "witness", status: "ok", started_at: minutesAgo(45) },
          { worker_name: "housekeeping", status: "ok", started_at: minutesAgo(5) },
          { worker_name: "compliance", status: "ok", started_at: minutesAgo(5) },
        ],
      }),
    );
    expect(httpStatus).toBe(503);
    expect((body as Body).checks.witness).toMatchObject({ ok: false, last_run_age_minutes: 45 });
  });

  it("503 when KMS is unreachable (receipts cannot be signed)", async () => {
    const { httpStatus, body } = await buildReadiness(deps({ probeKms: async () => false }));
    expect(httpStatus).toBe(503);
    expect((body as Body).checks.signing_key).toMatchObject({
      custody: "kms",
      reachable: false,
      ok: false,
    });
  });

  it("an unreachable TSA is a warning, not a failure (receipts still issue)", async () => {
    const { httpStatus, body } = await buildReadiness(
      deps({ probeTsa: async () => false, queryPendingTimestamps: async () => 4 }),
    );
    const b = body as Body;
    expect(httpStatus).toBe(200);
    expect(b.checks.tsa).toMatchObject({ reachable: false, pending_timestamps: 4, ok: true });
    expect(b.warnings).toContain("tsa_unreachable");
  });

  it("caches the TSA and KMS probes so /ready cannot flood them", async () => {
    const probeTsa = vi.fn(async () => true);
    const probeKms = vi.fn(async () => true);
    const d = deps({ probeTsa, probeKms });
    await buildReadiness(d);
    await buildReadiness(d);
    await buildReadiness(d);
    expect(probeTsa).toHaveBeenCalledTimes(1);
    expect(probeKms).toHaveBeenCalledTimes(1);
  });

  it("software interim key is ready but flagged", async () => {
    const { httpStatus, body } = await buildReadiness(
      deps({
        env: {
          AEGIS_RECEIPT_KMS_KEY_ID: "",
          AEGIS_RECEIPT_SIGNING_KEY_B64: Buffer.alloc(32, 1).toString("base64"),
          AEGIS_ALLOW_SOFTWARE_KEY_IN_PRODUCTION: "interim",
        },
      }),
    );
    expect(httpStatus).toBe(200);
    expect((body as Body).checks.signing_key).toMatchObject({
      custody: "software_interim",
      ok: true,
    });
    expect((body as Body).warnings).toContain("software_key_interim");
  });

  it("production without any signing key is not ready; dev without one is fine", async () => {
    const prod = await buildReadiness(
      deps({ env: { AEGIS_RECEIPT_KMS_KEY_ID: "", AEGIS_TSA_URL: "" } }),
    );
    expect(prod.httpStatus).toBe(503);
    const dev = await buildReadiness(
      deps({
        env: { AEGIS_ENV: "", AEGIS_RECEIPT_KMS_KEY_ID: "", AEGIS_TSA_URL: "" },
      }),
    );
    expect(dev.httpStatus).toBe(200);
    expect((dev.body as Body).checks.tsa).toMatchObject({ configured: false });
  });
});
