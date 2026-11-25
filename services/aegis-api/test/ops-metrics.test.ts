import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  maybeNotifyOpsAlerts,
  resetOpsAlertStateForTests,
} from "../src/health/alerts.js";
import {
  recordApiError,
  resetApiErrorCountersForTests,
} from "../src/health/error-counters.js";
import { collectMetrics } from "../src/health/metrics.js";
import {
  resetReadinessCachesForTests,
  type ReadinessDeps,
  type ReadinessResult,
} from "../src/health/readiness.js";

const NOW = Date.parse("2026-11-16T06:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000);

function deps(
  over: Partial<ReadinessDeps> & { env?: Record<string, string> } = {},
): ReadinessDeps {
  return {
    now: () => NOW,
    pingDatabase: async () => ({ ok: true }),
    queryWorkers: async () => [
      { worker_name: "witness", status: "ok", started_at: minutesAgo(2) },
      { worker_name: "housekeeping", status: "ok", started_at: minutesAgo(60) },
      { worker_name: "compliance", status: "ok", started_at: minutesAgo(60) },
    ],
    queryLastBatchAt: async () => minutesAgo(3),
    queryPendingTimestamps: async () => 7,
    probeTsa: async () => true,
    probeKms: async () => true,
    ...over,
    env: {
      DATABASE_URL: "postgresql://u:p@db/aegis",
      AEGIS_TSA_URL: "http://timestamp.sectigo.com",
      ALERT_QUEUE_LAG_THRESHOLD: "500",
      ...(over.env ?? {}),
    },
  };
}

beforeEach(() => {
  resetReadinessCachesForTests();
  resetOpsAlertStateForTests();
  resetApiErrorCountersForTests();
});

describe("ops metrics", () => {
  it("exposes error counts, witness age, queue lag and worker status", async () => {
    recordApiError();
    const { body } = await collectMetrics(deps());
    expect(body).toMatchObject({
      service: "aegis-api",
      status: "ready",
      errors: { unhandled: 1, http_5xx_window: 0 },
      auth: "ops_token_required",
      witness: {
        ok: true,
        last_run_age_minutes: 2,
        last_batch_age_minutes: 3,
      },
      queue: {
        pending_timestamps: 7,
        lag_threshold: 500,
        lag_exceeded: false,
      },
    });
    const workers = body.workers as Array<{ name: string; ready: boolean; status: string }>;
    expect(workers.map((worker) => worker.name)).toEqual([
      "witness",
      "housekeeping",
      "compliance",
    ]);
    expect(workers.every((worker) => worker.ready && worker.status === "ok")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("timestamp.sectigo.com");
    expect(JSON.stringify(body)).not.toContain("arn:aws");
  });

  it("reports a stale witness and queue lag without dropping the fields", async () => {
    const { readiness, body } = await collectMetrics(
      deps({
        queryWorkers: async () => [
          { worker_name: "witness", status: "ok", started_at: minutesAgo(45) },
          { worker_name: "housekeeping", status: "ok", started_at: minutesAgo(5) },
          { worker_name: "compliance", status: "ok", started_at: minutesAgo(5) },
        ],
        queryPendingTimestamps: async () => 501,
      }),
    );
    expect(readiness.httpStatus).toBe(503);
    expect(body).toMatchObject({
      status: "not_ready",
      witness: { ok: false, last_run_age_minutes: 45 },
      queue: { pending_timestamps: 501, lag_threshold: 500, lag_exceeded: true },
    });
  });
});

function witnessDown(pending = 0): ReadinessResult {
  return {
    httpStatus: 503,
    body: {
      status: "not_ready",
      checks: {
        witness: {
          configured: true,
          ok: false,
          last_run_age_minutes: 45,
          last_batch_age_minutes: 40,
        },
        tsa: { pending_timestamps: pending },
      },
    },
  };
}

describe("ops alerts", () => {
  it("posts ALERT_WEBHOOK_URL when the witness is not ready, then dedupes", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const env = {
      ALERT_WEBHOOK_URL: "https://hooks.example/ops",
      ALERT_QUEUE_LAG_THRESHOLD: "500",
    };
    const first = await maybeNotifyOpsAlerts(witnessDown(), {
      env,
      fetchImpl,
      now: () => NOW,
    });
    expect(first.sent).toEqual(["witness_not_ready"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    const payload = JSON.parse(String(init.body)) as {
      alert: string;
      witness: { last_run_age_minutes: number; last_batch_age_minutes: number };
    };
    expect(payload.alert).toBe("witness_not_ready");
    expect(payload.witness.last_run_age_minutes).toBe(45);
    expect(payload.witness.last_batch_age_minutes).toBe(40);
    expect(JSON.stringify(payload)).not.toContain("hooks.example");

    const again = await maybeNotifyOpsAlerts(witnessDown(), {
      env,
      fetchImpl,
      now: () => NOW + 5 * 60_000,
    });
    expect(again.sent).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("logs once and does not fetch when the webhook is unset", async () => {
    const logs: string[] = [];
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    await maybeNotifyOpsAlerts(witnessDown(), {
      env: { ALERT_WEBHOOK_URL: "" },
      fetchImpl,
      log: (message) => logs.push(message),
    });
    await maybeNotifyOpsAlerts(witnessDown(), {
      env: {},
      fetchImpl,
      log: (message) => logs.push(message),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/ALERT_WEBHOOK_URL is not set/);
    expect(logs[0]).toMatch(/witness_not_ready/);
  });

  it("posts queue_lag when pending timestamps exceed the threshold", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const ready: ReadinessResult = {
      httpStatus: 200,
      body: {
        status: "ready",
        checks: {
          witness: { configured: true, ok: true, last_run_age_minutes: 1 },
          tsa: { pending_timestamps: 12 },
        },
      },
    };
    const sent = await maybeNotifyOpsAlerts(ready, {
      env: {
        ALERT_WEBHOOK_URL: "https://hooks.example/ops",
        ALERT_QUEUE_LAG_THRESHOLD: "10",
      },
      fetchImpl,
      now: () => NOW,
    });
    expect(sent.sent).toEqual(["queue_lag"]);
    const payload = JSON.parse(
      String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body),
    ) as { alert: string; queue: { pending_timestamps: number; lag_threshold: number } };
    expect(payload.alert).toBe("queue_lag");
    expect(payload.queue).toMatchObject({ pending_timestamps: 12, lag_threshold: 10 });
  });

  it("stays quiet when witness and queue are healthy", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const sent = await maybeNotifyOpsAlerts(
      {
        httpStatus: 200,
        body: {
          status: "ready",
          checks: {
            witness: { configured: true, ok: true },
            tsa: { pending_timestamps: 3 },
            database: { configured: true, ok: true },
            signing_key: { configured: true, custody: "kms", ok: true },
          },
        },
      },
      {
        env: {
          ALERT_WEBHOOK_URL: "https://hooks.example/ops",
          ALERT_QUEUE_LAG_THRESHOLD: "500",
        },
        fetchImpl,
      },
    );
    expect(sent.sent).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("alerts on database_down, kms_error and http_5xx_spike", async () => {
    const { recordHttp5xx } = await import("../src/health/error-counters.js");
    for (let i = 0; i < 26; i++) recordHttp5xx(NOW);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const sent = await maybeNotifyOpsAlerts(
      {
        httpStatus: 503,
        body: {
          status: "not_ready",
          reason: "database_unavailable",
          checks: {
            database: { configured: true, ok: false },
            signing_key: {
              configured: true,
              custody: "kms",
              ok: false,
              reachable: false,
            },
            witness: { configured: true, ok: true },
            tsa: { pending_timestamps: 0 },
          },
        },
      },
      {
        env: {
          ALERT_WEBHOOK_URL: "https://hooks.example/ops",
          ALERT_QUEUE_LAG_THRESHOLD: "500",
          ALERT_5XX_SPIKE_THRESHOLD: "25",
        },
        fetchImpl,
        now: () => NOW,
      },
    );
    expect(sent.sent.sort()).toEqual(
      ["database_down", "http_5xx_spike", "kms_error"].sort(),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
