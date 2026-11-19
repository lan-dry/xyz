import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEnvelope, generateKeyPair, signEnvelope, verifyEnvelope } from "@salanor/aegis-sdk";
import { ConnectorState } from "../src/state.js";
import { makeHarness, post, waitFor, type Harness } from "./helpers.js";

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(async () => {
  await h.cleanup();
});

describe("crash safety", () => {
  it("never reuses a seq across restarts and re-sends queued envelopes with the same idempotency key", async () => {
    h.aegis.mode = "down";
    const first = await h.start();
    const a = (await (await post(first.base, "/events", { n: 1 })).json()) as { seq: number; idempotency_key: string };
    const b = (await (await post(first.base, "/events", { n: 2 })).json()) as { seq: number; idempotency_key: string };
    expect([a.seq, b.seq]).toEqual([1, 2]);
    await first.connector.close(); // simulated stop while outbox is non-empty

    h.aegis.mode = "ok";
    h.aegis.attempts.length = 0;
    const second = await h.start();
    await waitFor(() => h.aegis.accepted.length === 2);
    expect(h.aegis.accepted.map((e) => [e.seq, e.idempotency_key])).toEqual([
      [1, a.idempotency_key],
      [2, b.idempotency_key],
    ]);

    const c = (await (await post(second.base, "/events", { n: 3 })).json()) as { seq: number };
    expect(c.seq).toBe(3);
    for (const env of h.aegis.accepted) {
      expect(await verifyEnvelope(env, h.publicKeyB64)).toEqual({ ok: true });
    }
  });

  it("does not resend delivered envelopes after restart", async () => {
    const first = await h.start();
    await post(first.base, "/events", { n: 1 });
    await first.connector.close();
    h.aegis.attempts.length = 0;
    const second = await h.start();
    await new Promise((r) => setTimeout(r, 50));
    expect(h.aegis.attempts).toHaveLength(0);
    expect(second.connector.health()).toMatchObject({ last_seq: 1, outbox_size: 0 });
  });

  it("recovers last_seq from the outbox if state.json is stale (crash between the two writes)", async () => {
    const keys = await generateKeyPair();
    const dir = join(h.dir, "crash-state");
    await mkdir(join(dir, "outbox"), { recursive: true });
    await writeFile(join(dir, "state.json"), JSON.stringify({ version: 1, source_id: "src_test", last_seq: 4 }));
    const env = await signEnvelope(
      buildEnvelope({ source_id: "src_test", key_id: "k", seq: 5, event: { crash: true } }),
      keys.privateKey,
    );
    await writeFile(join(dir, "outbox", `${"5".padStart(16, "0")}.json`), JSON.stringify(env));
    // leftover temp file from an interrupted write must be ignored/cleaned
    await writeFile(join(dir, "outbox", `${"6".padStart(16, "0")}.json.123.tmp`), "{partial");

    const state = await ConnectorState.open(dir, "src_test");
    try {
      expect(state.lastSeq).toBe(5);
      expect(state.listOutbox().map((e) => e.seq)).toEqual([5]);
      expect(JSON.parse(await readFile(join(dir, "state.json"), "utf8")).last_seq).toBe(5);
      expect((await readdir(join(dir, "outbox"))).some((n) => n.endsWith(".tmp"))).toBe(false);
    } finally {
      await state.close();
    }
  });

  it("drops an outbox file that was acked but not removed before a crash", async () => {
    const keys = await generateKeyPair();
    const dir = join(h.dir, "acked-state");
    const first = await ConnectorState.open(dir, "src_test");
    const env = await signEnvelope(
      buildEnvelope({ source_id: "src_test", key_id: "k", seq: 1, event: { a: 1 } }),
      keys.privateKey,
    );
    await first.appendOutbox(env);
    await first.markDelivered(1, 200, { ok: true });
    await first.close();
    // simulate: ack logged, but unlink never happened
    await writeFile(join(dir, "outbox", `${"1".padStart(16, "0")}.json`), JSON.stringify(env));

    const second = await ConnectorState.open(dir, "src_test");
    try {
      expect(second.outboxSize).toBe(0);
      expect(second.lastSeq).toBe(1);
      expect(second.findByIdempotencyKey(env.idempotency_key)?.state).toBe("delivered");
    } finally {
      await second.close();
    }
  });

  it("tolerates a torn trailing line in delivered.jsonl", async () => {
    const keys = await generateKeyPair();
    const dir = join(h.dir, "torn-state");
    const first = await ConnectorState.open(dir, "src_test");
    const env = await signEnvelope(
      buildEnvelope({ source_id: "src_test", key_id: "k", seq: 1, event: {} }),
      keys.privateKey,
    );
    await first.appendOutbox(env);
    await first.markDelivered(1, 200, {});
    await first.close();
    const path = join(dir, "delivered.jsonl");
    await writeFile(path, (await readFile(path, "utf8")) + '{"seq":2,"idem');

    const second = await ConnectorState.open(dir, "src_test");
    try {
      expect(second.lastSeq).toBe(1);
      expect(second.findByIdempotencyKey(env.idempotency_key)?.state).toBe("delivered");
      expect((await readFile(path, "utf8")).endsWith("\n")).toBe(true);
    } finally {
      await second.close();
    }
  });

  it("refuses a state directory that belongs to another source", async () => {
    const dir = join(h.dir, "other-state");
    const s = await ConnectorState.open(dir, "src_a");
    await s.close();
    await expect(ConnectorState.open(dir, "src_b")).rejects.toThrow(/belongs to source_id/);
  });

  it("refuses to run two connectors on the same state directory", async () => {
    const dir = join(h.dir, "locked-state");
    const s = await ConnectorState.open(dir, "src_a");
    try {
      await expect(ConnectorState.open(dir, "src_a")).rejects.toThrow(/already open|locked/);
    } finally {
      await s.close();
    }
  });

  it("appendOutbox refuses a seq gap or reuse", async () => {
    const keys = await generateKeyPair();
    const dir = join(h.dir, "seq-state");
    const s = await ConnectorState.open(dir, "src_a");
    try {
      const mk = (seq: number) =>
        signEnvelope(buildEnvelope({ source_id: "src_a", key_id: "k", seq, event: {} }), keys.privateKey);
      await s.appendOutbox(await mk(1));
      await expect(s.appendOutbox(await mk(1))).rejects.toThrow(/seq must be 2/);
      await expect(s.appendOutbox(await mk(3))).rejects.toThrow(/seq must be 2/);
    } finally {
      await s.close();
    }
  });
});
