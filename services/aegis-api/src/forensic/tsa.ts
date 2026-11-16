/**
 * Trusted-time helpers for forensic receipts: TSA configuration and a minimal
 * DER reader for RFC 3161 TimeStampResp (status, genTime, messageImprint).
 *
 * The reader does NOT verify the CMS signature or certificate chain. Aegis
 * records what the authority asserted; anyone can re-check the stored token
 * with `openssl ts -verify` (docs/TRUSTED_TIME.md).
 */

/**
 * Recommended public TSA: Sectigo (http://timestamp.sectigo.com), operated by a
 * WebTrust-audited public CA. See docs/TRUSTED_TIME.md for the choice and the
 * alternatives (FreeTSA for dev, a contracted TSA such as DigiCert for an SLA).
 */
export const RECOMMENDED_TSA_URL = "http://timestamp.sectigo.com";

const KNOWN_TSA_AUTHORITIES: Array<[RegExp, string]> = [
  [/(^|\.)sectigo\.com$/i, "Sectigo"],
  [/(^|\.)freetsa\.org$/i, "FreeTSA"],
  [/(^|\.)digicert\.com$/i, "DigiCert"],
  [/(^|\.)globalsign\.com$/i, "GlobalSign"],
];

export type TsaConfig = { url: string; authority: string };

/** Human name of the time authority shown as "Trusted time: <authority> at <UTC>". */
export function tsaAuthorityName(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = env.AEGIS_TSA_NAME?.trim();
  if (explicit) return explicit;
  try {
    const host = new URL(url).hostname;
    for (const [re, name] of KNOWN_TSA_AUTHORITIES) {
      if (re.test(host)) return name;
    }
    return host;
  } catch {
    return "Time-stamp authority";
  }
}

/** null when AEGIS_TSA_URL is not set (trusted time disabled). */
export function getTsaConfig(
  env: NodeJS.ProcessEnv = process.env,
): TsaConfig | null {
  const url = env.AEGIS_TSA_URL?.trim();
  if (!url) return null;
  return { url, authority: tsaAuthorityName(url, env) };
}

type Tlv = { tag: number; start: number; end: number };

function readTlv(buf: Buffer, offset: number, limit = buf.length): Tlv {
  if (offset + 2 > limit) throw new Error("DER truncated");
  const tag = buf[offset]!;
  let len = buf[offset + 1]!;
  let start = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("DER length unsupported");
    if (start + n > limit) throw new Error("DER truncated");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i]!;
    start += n;
  }
  const end = start + len;
  if (end > limit) throw new Error("DER truncated");
  return { tag, start, end };
}

function children(buf: Buffer, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let off = parent.start;
  while (off < parent.end) {
    const t = readTlv(buf, off, parent.end);
    out.push(t);
    off = t.end;
  }
  return out;
}

function generalizedTimeToIso(text: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(text);
  if (!m) throw new Error("genTime is not a UTC GeneralizedTime");
  const ms = m[7] ? Number(`0.${m[7]}`) * 1000 : 0;
  const d = new Date(
    Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!, Math.round(ms)),
  );
  if (Number.isNaN(d.getTime())) throw new Error("genTime invalid");
  return d.toISOString();
}

export type ParsedTimeStampReply =
  | {
      ok: true;
      /** UTC time the authority asserts (TSTInfo.genTime). */
      gen_time: string;
      /** Hex of TSTInfo.messageImprint.hashedMessage. */
      message_hash_hex: string;
    }
  | { ok: false; error: string };

/** Read status, genTime and messageImprint out of a DER TimeStampResp (RFC 3161). */
export function parseRfc3161Reply(reply: Uint8Array): ParsedTimeStampReply {
  try {
    const buf = Buffer.from(reply);
    const resp = readTlv(buf, 0);
    if (resp.tag !== 0x30) return { ok: false, error: "not a TimeStampResp" };
    const [statusInfo, tokenInfo] = children(buf, resp);
    if (!statusInfo || statusInfo.tag !== 0x30) {
      return { ok: false, error: "missing PKIStatusInfo" };
    }
    const statusInt = children(buf, statusInfo)[0];
    if (!statusInt || statusInt.tag !== 0x02) {
      return { ok: false, error: "missing PKIStatus" };
    }
    const status = buf[statusInt.start]!;
    if (status !== 0 && status !== 1) {
      return { ok: false, error: `TSA rejected the request (PKIStatus ${status})` };
    }
    if (!tokenInfo || tokenInfo.tag !== 0x30) {
      return { ok: false, error: "granted reply has no timeStampToken" };
    }
    // ContentInfo { OID, [0] SignedData }
    const explicitSigned = children(buf, tokenInfo)[1];
    if (!explicitSigned || explicitSigned.tag !== 0xa0) {
      return { ok: false, error: "timeStampToken is not SignedData" };
    }
    const signedData = children(buf, explicitSigned)[0];
    if (!signedData || signedData.tag !== 0x30) {
      return { ok: false, error: "SignedData missing" };
    }
    // SignedData { version, digestAlgorithms, encapContentInfo, ... }
    const encap = children(buf, signedData)[2];
    if (!encap || encap.tag !== 0x30) {
      return { ok: false, error: "encapContentInfo missing" };
    }
    const explicitContent = children(buf, encap)[1];
    if (!explicitContent || explicitContent.tag !== 0xa0) {
      return { ok: false, error: "TSTInfo missing" };
    }
    const octet = children(buf, explicitContent)[0];
    if (!octet || octet.tag !== 0x04) return { ok: false, error: "TSTInfo missing" };
    const tstInfo = readTlv(buf, octet.start, octet.end);
    if (tstInfo.tag !== 0x30) return { ok: false, error: "TSTInfo malformed" };
    // TSTInfo { version, policy, messageImprint, serialNumber, genTime, ... }
    const parts = children(buf, tstInfo);
    const imprint = parts[2];
    const genTime = parts[4];
    if (!imprint || imprint.tag !== 0x30) {
      return { ok: false, error: "messageImprint missing" };
    }
    if (!genTime || genTime.tag !== 0x18) {
      return { ok: false, error: "genTime missing" };
    }
    const hashed = children(buf, imprint)[1];
    if (!hashed || hashed.tag !== 0x04) {
      return { ok: false, error: "hashedMessage missing" };
    }
    return {
      ok: true,
      gen_time: generalizedTimeToIso(
        buf.subarray(genTime.start, genTime.end).toString("ascii"),
      ),
      message_hash_hex: buf.subarray(hashed.start, hashed.end).toString("hex"),
    };
  } catch (err) {
    return {
      ok: false,
      error: `unreadable TSA reply: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
