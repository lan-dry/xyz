import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyEnvelope } from "@salanor/aegis-sdk";
import { makeHarness, post, waitFor, type Harness } from "./helpers.js";

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(async () => {
  await h.cleanup();
});

describe("POST /events", () => {
  it("signs, delivers and returns the receipt", async () => {
    const { base } = await h.start();
    const res = await post(base, "/events", { type: "loan.approved", amount: "1500.00" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "delivered",
      seq: 1,
      duplicate: false,
      receipt: { receipt_id: "rcpt_1" },
    });

    expect(h.aegis.accepted).toHaveLength(1);
    const sent = h.aegis.accepted[0];
    expect(sent.source_id).toBe("src_test");
    expect(sent.key_id).toBe("k_test_1");
    expect(sent.seq).toBe(1);
    expect(await verifyEnvelope(sent, h.publicKeyB64)).toEqual({ ok: true });
    expect(h.aegis.attempts[0].headers.Authorization).toBe("Bearer ingest_test_key");
  });

  it("assigns strictly increasing seq under concurrency, each sent exactly once", async () => {
    const { base } = await h.start();
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => post(base, "/events", { n: i })),
    );
    const seqs = (await Promise.all(responses.map((r) => r.json()))).map((b) => (b as { seq: number }).seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(h.aegis.attempts.map((a) => a.envelope.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(h.aegis.accepted.map((e) => e.idempotency_key)).size).toBe(10);
  });

  it("queues (202) when Aegis is down and retries the identical envelope", async () => {
    h.aegis.mode = "down";
    const { base, connector } = await h.start();
    const res = await post(base, "/events", { type: "t" });
    expect(res.status).toBe(202);
    const queued = (await res.json()) as { status: string; seq: number; idempotency_key: string };
    expect(queued).toMatchObject({ status: "queued", seq: 1 });

    await waitFor(() => h.aegis.attempts.length >= 3);
    h.aegis.mode = "ok";
    await waitFor(() => h.aegis.accepted.length === 1);

    const keys = new Set(h.aegis.attempts.map((a) => a.envelope.idempotency_key));
    expect(keys).toEqual(new Set([queued.idempotency_key]));
    const bodies = new Set(h.aegis.attempts.map((a) => JSON.stringify(a.envelope)));
    expect(bodies.size).toBe(1); // byte-identical retries
    await waitFor(() => connector.health().outbox_size === 0);
    expect(connector.health()).toMatchObject({ connected: true, last_error: null, last_seq: 1 });
  });

  it("preserves order: later events wait behind a failing head", async () => {
    h.aegis.mode = "error500";
    const { base, connector } = await h.start();
    await post(base, "/events", { n: 1 });
    await post(base, "/events", { n: 2 });
    await waitFor(() => h.aegis.attempts.length >= 2);
    expect(new Set(h.aegis.attempts.map((a) => a.envelope.seq))).toEqual(new Set([1]));
    expect(connector.health().outbox_size).toBe(2);
    h.aegis.mode = "ok";
    await waitFor(() => h.aegis.accepted.length === 2);
    expect(h.aegis.accepted.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("does not double-send: an idempotent resubmission returns the original", async () => {
    const { base } = await h.start();
    const key = "11111111-1111-4111-8111-111111111111";
    const first = await (await post(base, "/events", { n: 1 }, { "Idempotency-Key": key })).json();
    const again = await post(base, "/events", { n: 1 }, { "Idempotency-Key": key });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ seq: (first as { seq: number }).seq, duplicate: true });
    expect(h.aegis.attempts).toHaveLength(1);

    const conflict = await post(base, "/events", { n: 2 }, { "Idempotency-Key": key });
    expect(conflict.status).toBe(422);
    expect(h.aegis.attempts).toHaveLength(1);
  });

  it("rejects bad input", async () => {
    const { base } = await h.start();
    expect((await post(base, "/events", "{not json")).status).toBe(400);
    expect((await post(base, "/events", [1, 2])).status).toBe(400);
    expect((await post(base, "/events", { amount: 12.5 })).status).toBe(400);
    expect((await post(base, "/events", {}, { "Idempotency-Key": "nope" })).status).toBe(400);
    expect(h.aegis.attempts).toHaveLength(0);
    // rejected requests must not burn a seq
    const ok = await (await post(base, "/events", { ok: true })).json();
    expect((ok as { seq: number }).seq).toBe(1);
  });

  it("accepts an empty-object event", async () => {
    const { base } = await h.start();
    const res = await post(base, "/events", {});
    expect(res.status).toBe(200);
  });
});

describe("other routes", () => {
  it("GET /health reports state", async () => {
    const { base } = await h.start();
    await post(base, "/events", { n: 1 });
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      status: "ok",
      source_id: "src_test",
      key_id: "k_test_1",
      connected: true,
      outbox_size: 0,
      last_seq: 1,
      public_key_b64: h.publicKeyB64,
    });
    expect(typeof body.clock_skew_ms).toBe("number");
    expect(Math.abs(body.clock_skew_ms as number)).toBeLessThan(5000);
  });

  it("health shows a backlog when Aegis rejects the bearer", async () => {
    h.aegis.mode = "unauthorized";
    const { base, connector } = await h.start();
    await post(base, "/events", { n: 1 });
    await waitFor(() => connector.health().last_error !== null);
    expect(connector.health()).toMatchObject({ connected: false, outbox_size: 1 });
    expect(String(connector.health().last_error)).toContain("401");
  });

  it("POST /execute/confirm forwards to Aegis executions/confirm", async () => {
    const { base } = await h.start();
    const res = await post(base, "/execute/confirm", {
      token: { token_id: "dtk_1", v: 1 },
      params: { amount: "100.00", currency: "RWF" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; echoed: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.echoed.params).toEqual({ amount: "100.00", currency: "RWF" });
    expect(body.echoed.source_envelope).toMatchObject({
      aegis_envelope: "1",
      source_id: "src_test",
    });
    expect(h.aegis.confirms).toHaveLength(1);
    expect(h.aegis.confirms[0].headers.Authorization).toBe("Bearer ingest_test_key");
  });

  it("404 and 405", async () => {
    const { base } = await h.start();
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/events`)).status).toBe(405);
    expect((await post(base, "/health", {})).status).toBe(405);
  });
});

describe("local auth token", () => {
  it("is required on /events when configured", async () => {
    await h.cleanup();
    h = await makeHarness({ local_auth_token: "s3cret-local" });
    const { base } = await h.start();
    expect((await post(base, "/events", { n: 1 })).status).toBe(401);
    expect((await post(base, "/events", { n: 1 }, { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await post(base, "/events", { n: 1 }, { Authorization: "Bearer s3cret-local" })).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe("sequence ownership", () => {
  it("two Connectors on one source_id: second syncs after seq_replay and never reuses a seq", async () => {
    h.aegis.mode = "seq_gate";
    const first = await h.start();
    const second = await h.startSibling("state_b");

    for (let n = 1; n <= 3; n++) {
      const res = await (await post(first.base, "/events", { from: "a", n })).json();
      expect(res).toMatchObject({ status: "delivered", seq: n });
    }
    expect(h.aegis.lastSeqBySource.get("src_test")).toBe(3);

    // Second instance still thinks last_seq=0 and will try seq 1 → seq_replay → sync to 3.
    const bConflict = await post(second.base, "/events", { from: "b", conflict: true });
    expect([200, 202]).toContain(bConflict.status);

    await waitFor(() => Number(second.connector.health().last_seq) >= 3);
    expect(h.aegis.accepted.filter((e) => e.seq === 1)).toHaveLength(1);
    expect(String(second.connector.health().last_error ?? "")).toMatch(
      /another instance appears to own|seq ownership conflict|behind remote/i,
    );

    const bNext = await post(second.base, "/events", { from: "b", n: 4 });
    expect(bNext.status).toBe(200);
    const body = (await bNext.json()) as { seq: number };
    expect(body.seq).toBe(4);

    const acceptedSeqs = h.aegis.accepted.map((e) => e.seq).sort((a, b) => a - b);
    expect(acceptedSeqs).toEqual([1, 2, 3, 4]);
    expect(new Set(acceptedSeqs).size).toBe(4);
  });

  it("demo catch-up adopts a remote gap once, then a later gap stays an ownership conflict", async () => {
    await h.cleanup();
    h = await makeHarness({ demo_seq_catchup: true, sync_wait_ms: 1500 });
    h.aegis.mode = "seq_gate";
    h.aegis.tenantKind = "demo";
    h.aegis.lastSeqBySource.set("src_test", 5);
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const { base, connector } = await h.start();
      expect(lines).toContain("Synced local sequence to remote (was 0, now 5). Continuing.");
      const first = await post(base, "/events", { from: "demo", n: 1 });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ status: "delivered", seq: 6 });

      h.aegis.lastSeqBySource.set("src_test", 20);
      const clash = await post(base, "/events", { from: "demo", clash: true });
      expect([200, 202]).toContain(clash.status);
      expect(String(connector.health().last_error ?? "")).toMatch(/seq ownership conflict/i);
      expect(lines.filter((l) => l.startsWith("Synced local sequence to remote"))).toHaveLength(1);
    } finally {
      console.log = orig;
    }
  });

  it("does not catch up a real tenant even when demo_seq_catchup is set", async () => {
    await h.cleanup();
    h = await makeHarness({ demo_seq_catchup: true, sync_wait_ms: 1500 });
    h.aegis.mode = "seq_gate";
    h.aegis.tenantKind = "real";
    h.aegis.lastSeqBySource.set("src_test", 5);
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      const { base, connector } = await h.start();
      const first = await post(base, "/events", { from: "real", n: 1 });
      expect([200, 202]).toContain(first.status);
      expect(String(connector.health().last_error ?? "")).toMatch(/seq ownership conflict/i);
      expect(lines.some((l) => l.includes("Synced local sequence to remote"))).toBe(false);
      expect(h.aegis.accepted).toHaveLength(0);
    } finally {
      console.log = orig;
    }
  });
});
