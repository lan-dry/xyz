import { describe, expect, it, vi } from "vitest";
import {
  buildRfc3161TimestampRequest,
  requestRfc3161Timestamp,
} from "../src/forensic/rfc3161.js";

describe("RFC3161 production TSA client", () => {
  it("builds a DER request of plausible size for SHA-256", () => {
    const hash = "a".repeat(64);
    const req = buildRfc3161TimestampRequest(hash);
    expect(req.length).toBeGreaterThan(40);
    expect(req[0]).toBe(0x30);
  });

  it("refuses when AEGIS_TSA_URL unset", async () => {
    const prev = process.env.AEGIS_TSA_URL;
    delete process.env.AEGIS_TSA_URL;
    const result = await requestRfc3161Timestamp("a".repeat(64));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/AEGIS_TSA_URL/);
    if (prev === undefined) delete process.env.AEGIS_TSA_URL;
    else process.env.AEGIS_TSA_URL = prev;
  });

  it("POSTs timestamp-query and stores binary reply", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit): Promise<Response> => {
        return {
          ok: true,
          status: 200,
          async arrayBuffer() {
            return Uint8Array.from([0x30, 0x08, 0x02, 0x01, 0x00, 0x04, 0x03, 0x01, 0x02, 0x03]).buffer;
          },
          async text() {
            return "";
          },
        } as Response;
      },
    );
    const result = await requestRfc3161Timestamp("b".repeat(64), {
      tsaUrl: "https://tsa.example.test/ts",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.token?.alg).toBe("rfc3161");
    expect(result.token?.token_b64.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/timestamp-query",
    });
  });
});
