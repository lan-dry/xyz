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

  it("POST /execute/confirm is a 501 stub", async () => {
    const { base } = await h.start();
    const res = await post(base, "/execute/confirm", { anything: true });
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({ error: "not_implemented", stage: 3 });
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
