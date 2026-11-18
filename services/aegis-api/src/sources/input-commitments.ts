/**
 * Stage 7: input commitments — SHA-256 hashes of source documents bound into the
 * sealed receipt / evidence bundle. Optional encrypted copy storage is OFF by default
 * (`AEGIS_STORE_INPUT_COPIES=1` to enable a stub store that still never returns cleartext
 * without an explicit caller).
 */
import { createHash, createCipheriv, randomBytes } from "node:crypto";

export type InputCommitment = {
  /** Stable name, e.g. application_form.pdf */
  name: string;
  /** Lowercase hex SHA-256 of the raw document bytes. */
  sha256: string;
  media_type?: string | null;
  /** Optional byte length claimed by the sender (not trusted). */
  size_bytes?: number | null;
};

export type SuppliedDocument = {
  name: string;
  /** Raw bytes, or base64 of the document. */
  content: Uint8Array | string;
  /** When "base64", `content` is a base64 string; otherwise treated as utf8 text or bytes. */
  encoding?: "raw" | "utf8" | "base64";
};

export type CommitmentCheck = {
  name: string;
  expected_sha256: string;
  actual_sha256: string | null;
  ok: boolean;
  message: string;
};

const HEX256 = /^[0-9a-f]{64}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function normalizeSha256(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/^sha256:/, "");
  return HEX256.test(s) ? s : null;
}

/** Parse `input_commitments` from event attributes. Invalid entries are dropped. */
export function parseInputCommitments(attributes: Record<string, unknown>): InputCommitment[] {
  const raw = attributes.input_commitments;
  if (!Array.isArray(raw)) return [];
  const out: InputCommitment[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const sha256 = normalizeSha256(item.sha256 ?? item.hash);
    if (!name || !sha256) continue;
    out.push({
      name,
      sha256,
      media_type: typeof item.media_type === "string" ? item.media_type : null,
      size_bytes:
        typeof item.size_bytes === "number" && Number.isFinite(item.size_bytes)
          ? item.size_bytes
          : null,
    });
  }
  return out;
}

export function sha256HexOfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function documentBytes(doc: SuppliedDocument): Uint8Array {
  if (typeof doc.content !== "string") return doc.content;
  const enc = doc.encoding ?? "utf8";
  if (enc === "base64") return new Uint8Array(Buffer.from(doc.content, "base64"));
  return new Uint8Array(Buffer.from(doc.content, "utf8"));
}

/**
 * Check supplied documents against commitments. Documents without a matching
 * commitment name are ignored; missing documents for a commitment are reported as fail.
 */
export function verifySuppliedDocuments(
  commitments: InputCommitment[],
  documents: SuppliedDocument[],
): { ok: boolean; checks: CommitmentCheck[] } {
  const byName = new Map(documents.map((d) => [d.name, d]));
  const checks: CommitmentCheck[] = [];
  for (const c of commitments) {
    const doc = byName.get(c.name);
    if (!doc) {
      checks.push({
        name: c.name,
        expected_sha256: c.sha256,
        actual_sha256: null,
        ok: false,
        message: `No document supplied for commitment "${c.name}".`,
      });
      continue;
    }
    const actual = sha256HexOfBytes(documentBytes(doc));
    const ok = actual === c.sha256;
    checks.push({
      name: c.name,
      expected_sha256: c.sha256,
      actual_sha256: actual,
      ok,
      message: ok
        ? `Document "${c.name}" matches its SHA-256 commitment.`
        : `Document "${c.name}" does not match its SHA-256 commitment.`,
    });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** Collect commitments sealed on receipts (attributes.input_commitments). */
export function collectCommitmentsFromReceipts(
  receipts: Array<{ attributes?: Record<string, unknown> | null }>,
): InputCommitment[] {
  const seen = new Set<string>();
  const out: InputCommitment[] = [];
  for (const r of receipts) {
    const attrs = r.attributes ?? {};
    for (const c of parseInputCommitments(attrs)) {
      const key = `${c.name}|${c.sha256}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/**
 * Optional encrypted copy storage. Off unless AEGIS_STORE_INPUT_COPIES=1.
 * Uses AEGIS_INPUT_COPY_KEY_B64 (32-byte AES key, standard base64) when storing;
 * without a key, returns null (commitment-only mode).
 */
export function maybeStoreEncryptedCopy(input: {
  organization_id: string;
  case_id: string;
  commitment: InputCommitment;
  bytes: Uint8Array;
}): { stored: false; reason: string } | { stored: true; ciphertext_b64: string; iv_b64: string } {
  if (process.env.AEGIS_STORE_INPUT_COPIES !== "1") {
    return { stored: false, reason: "AEGIS_STORE_INPUT_COPIES is off (default)." };
  }
  const keyB64 = process.env.AEGIS_INPUT_COPY_KEY_B64?.trim();
  if (!keyB64) {
    return { stored: false, reason: "AEGIS_INPUT_COPY_KEY_B64 is not set." };
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    return { stored: false, reason: "AEGIS_INPUT_COPY_KEY_B64 must decode to 32 bytes." };
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(input.bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([enc, tag]);
  // Intentionally in-memory only for Stage 7 — no durable blob store yet.
  void input.organization_id;
  void input.case_id;
  void input.commitment;
  return {
    stored: true,
    ciphertext_b64: ciphertext.toString("base64"),
    iv_b64: iv.toString("base64"),
  };
}
