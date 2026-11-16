/**
 * Test helpers: build a structurally valid RFC 3161 TimeStampResp (DER) and a
 * fetch mock that returns it. Not cryptographically signed: Aegis only reads
 * status / genTime / messageImprint (docs/TRUSTED_TIME.md).
 */
import { vi } from "vitest";

function tlv(tag: number, content: Buffer): Buffer {
  const n = content.length;
  const len =
    n < 0x80
      ? Buffer.from([n])
      : n < 0x100
        ? Buffer.from([0x81, n])
        : Buffer.from([0x82, n >> 8, n & 0xff]);
  return Buffer.concat([Buffer.from([tag]), len, content]);
}

const seq = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
const int = (n: number) => tlv(0x02, Buffer.from([n]));
const oid = (hex: string) => tlv(0x06, Buffer.from(hex, "hex"));

function generalizedTime(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export function buildTimeStampResp(opts: {
  hashHex: string;
  genTime: Date;
  /** PKIStatus: 0 granted, 2 rejection. */
  status?: number;
}): Buffer {
  const status = opts.status ?? 0;
  if (status > 1) return seq(seq(int(status)));
  const sha256 = oid("608648016503040201");
  const tstInfo = seq(
    int(1),
    oid("2a030405"),
    seq(seq(sha256, Buffer.from([0x05, 0x00])), tlv(0x04, Buffer.from(opts.hashHex, "hex"))),
    int(7),
    tlv(0x18, Buffer.from(generalizedTime(opts.genTime), "ascii")),
  );
  const encap = seq(oid("2a864886f70d0109100104"), tlv(0xa0, tlv(0x04, tstInfo)));
  const signedData = seq(int(3), tlv(0x31, seq(sha256)), encap);
  const contentInfo = seq(oid("2a864886f70d010702"), tlv(0xa0, signedData));
  return seq(seq(int(status)), contentInfo);
}

/** Pull the SHA-256 imprint out of an RFC 3161 request body (our own builder's layout). */
export function imprintHexOfRequest(req: Uint8Array): string {
  const buf = Buffer.from(req);
  // ... 04 20 <32 bytes> 01 01 ff
  const i = buf.indexOf(Buffer.from([0x04, 0x20]));
  return buf.subarray(i + 2, i + 34).toString("hex");
}

/** fetch mock that behaves like a TSA: replies with a valid token for the posted hash. */
export function tsaFetch(opts: { genTime: Date; failTimes?: number; status?: number }) {
  let calls = 0;
  const fn = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
    calls += 1;
    if (calls <= (opts.failTimes ?? 0)) {
      throw new Error("connect ECONNREFUSED");
    }
    const hashHex = imprintHexOfRequest(init?.body as Uint8Array);
    const reply = buildTimeStampResp({
      hashHex,
      genTime: opts.genTime,
      status: opts.status,
    });
    return {
      ok: true,
      status: 200,
      async arrayBuffer() {
        return reply.buffer.slice(reply.byteOffset, reply.byteOffset + reply.byteLength);
      },
      async text() {
        return "";
      },
    } as Response;
  });
  return fn as typeof fn & typeof fetch;
}
