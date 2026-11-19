import { describe, expect, it } from "vitest";
import { buildEnvelope, generateKeyPair, sendEvent, signEnvelope } from "../src/index.js";

async function signedEnvelope() {
  const keys = await generateKeyPair();
  return signEnvelope(
    buildEnvelope({ source_id: "src_los", key_id: "k1", seq: 1, event: { type: "t" } }),
    keys.privateKey,
  );
}

describe("sendEvent", () => {
  it("POSTs the envelope with bearer + idempotency headers", async () => {
    const envelope = await signedEnvelope();
    let seen: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ receipt_id: "r1" }), {
        status: 200,
        headers: { date: "Wed, 18 Nov 2026 10:00:00 GMT" },
      });
    }) as unknown as typeof fetch;

    const res = await sendEvent({ url: "http://aegis.test/ingest", bearer: "key_123", envelope, fetch: fakeFetch });
    expect(res).toMatchObject({ ok: true, status: 200, retryable: false, body: { receipt_id: "r1" } });
    expect(res.serverDate).toBe("Wed, 18 Nov 2026 10:00:00 GMT");
    expect(seen?.url).toBe("http://aegis.test/ingest");
    const headers = seen?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer key_123");
    expect(headers["Idempotency-Key"]).toBe(envelope.idempotency_key);
    expect(JSON.parse(seen?.init.body as string)).toEqual(envelope);
  });

  it("marks 5xx and network errors retryable, 4xx not", async () => {
    const envelope = await signedEnvelope();
    const status = (code: number) =>
      (async () => new Response("{}", { status: code })) as unknown as typeof fetch;
    expect((await sendEvent({ url: "http://x", bearer: "k", envelope, fetch: status(503) })).retryable).toBe(true);
    expect((await sendEvent({ url: "http://x", bearer: "k", envelope, fetch: status(429) })).retryable).toBe(true);
    expect((await sendEvent({ url: "http://x", bearer: "k", envelope, fetch: status(400) })).retryable).toBe(false);
    const boom = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const res = await sendEvent({ url: "http://x", bearer: "k", envelope, fetch: boom });
    expect(res).toMatchObject({ ok: false, status: 0, retryable: true, error: "ECONNREFUSED" });
  });
});
