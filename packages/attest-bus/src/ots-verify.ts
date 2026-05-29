/** SHA256("BitcoinBlockHeaderAttestation") — present when OTS proof is Bitcoin-confirmed. */
export const OTS_BITCOIN_ATTESTATION_TAG = Buffer.from("0588960d73d2b77e", "hex");

export type OtsProofStatus = "pending" | "anchored" | "invalid";

export interface OtsProofVerifyResult {
  status: OtsProofStatus;
  upgradedProof?: Buffer;
  detail?: string;
}

export function hasBitcoinBlockAttestation(proof: Buffer): boolean {
  return proof.includes(OTS_BITCOIN_ATTESTATION_TAG);
}

const OTS_MAGIC = Buffer.from("\x00OpenTimestamps", "utf8");

export function isOpenTimestampsProof(proof: Buffer): boolean {
  return proof.length >= OTS_MAGIC.length && proof.subarray(0, OTS_MAGIC.length).equals(OTS_MAGIC);
}

/**
 * Upgrade a pending calendar proof via GET /timestamp/{digest}.
 * Returns merged proof bytes when the calendar has a newer attestation tree.
 */
export async function upgradeOtsFromCalendar(
  merkleRootHex: string,
  proof: Buffer,
  calendarBase: string,
): Promise<Buffer | null> {
  const digest = Buffer.from(merkleRootHex, "hex");
  if (digest.length !== 32) {
    throw new Error(`merkle root must be 32-byte hex, got length ${digest.length}`);
  }
  const base = calendarBase.replace(/\/$/, "");
  const url = `${base}/timestamp/${merkleRootHex}`;
  const res = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`OTS calendar upgrade HTTP ${res.status} from ${url}`);
  }
  const upgraded = Buffer.from(await res.arrayBuffer());
  if (upgraded.length === 0) {
    return null;
  }
  return upgraded.length >= proof.length ? upgraded : proof;
}

/**
 * FR-ATT-ANCHOR-OTS reconcile — determine whether a stored OTS proof is still pending or Bitcoin-anchored.
 */
export async function verifyOtsProof(input: {
  merkleRootHex: string;
  proof: Buffer;
  calendarUrl?: string;
}): Promise<OtsProofVerifyResult> {
  if (!isOpenTimestampsProof(input.proof)) {
    return { status: "invalid", detail: "not an OpenTimestamps proof file" };
  }

  let proof = input.proof;
  if (hasBitcoinBlockAttestation(proof)) {
    return { status: "anchored", upgradedProof: proof };
  }

  const calendar = input.calendarUrl?.trim();
  if (calendar) {
    try {
      const upgraded = await upgradeOtsFromCalendar(input.merkleRootHex, proof, calendar);
      if (upgraded && upgraded.length > proof.length) {
        proof = upgraded;
      }
    } catch (err) {
      return {
        status: "pending",
        upgradedProof: proof,
        detail: `calendar upgrade failed: ${(err as Error).message}`,
      };
    }
  }

  if (hasBitcoinBlockAttestation(proof)) {
    return { status: "anchored", upgradedProof: proof };
  }

  return { status: "pending", upgradedProof: proof, detail: "awaiting Bitcoin confirmation" };
}
