import type { BlobStore } from "@salanor/aegis-storage";

import type { AnchorBatchInput, AnchorBatchResult, AnchorProvider } from "./anchor";
import { StubAnchorProvider } from "./anchor";

const DEFAULT_CALENDAR = "https://a.pool.opentimestamps.org";

export interface OpenTimestampsAnchorOptions {
  calendarUrl?: string;
  /** When true, skip calendar HTTP (CI / offline) and return stub anchor only. */
  disabled?: boolean;
}

async function submitMerkleRootToCalendar(
  merkleRootHex: string,
  calendarBase: string,
): Promise<Buffer> {
  const digest = Buffer.from(merkleRootHex, "hex");
  if (digest.length !== 32) {
    throw new Error(`merkle root must be 32-byte hex, got length ${digest.length}`);
  }
  const base = calendarBase.replace(/\/$/, "");
  const url = `${base}/digest`;
  const res = await fetch(url, {
    method: "POST",
    body: digest,
    headers: { "Content-Type": "application/octet-stream" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`OTS calendar HTTP ${res.status} from ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * FR-AEG-ANCHOR-OTS — submit batch Merkle root to OpenTimestamps calendar; store proof in blob store.
 * Falls back to stub anchor when calendar is unreachable or AEGIS_OTS_DISABLED=1.
 */
export class OpenTimestampsAnchorProvider implements AnchorProvider {
  constructor(
    private readonly stub: StubAnchorProvider = new StubAnchorProvider(),
    private readonly blobStore: BlobStore | null = null,
    private readonly options: OpenTimestampsAnchorOptions = {},
  ) {}

  async anchorBatch(input: AnchorBatchInput): Promise<AnchorBatchResult> {
    const stubResult = await this.stub.anchorBatch(input);

    if (this.options.disabled) {
      return stubResult;
    }

    const calendar = this.options.calendarUrl?.trim() || DEFAULT_CALENDAR;
    try {
      const proof = await submitMerkleRootToCalendar(input.merkleRoot, calendar);
      const otsBlobKey = `ots/${input.merkleRoot}.ots`;
      if (this.blobStore) {
        await this.blobStore.put(otsBlobKey, proof);
      }
      return {
        anchorStatus: "pending",
        anchorRef: `ots:${otsBlobKey}`,
        localChainRoot: stubResult.localChainRoot,
        otsBlobKey: this.blobStore ? otsBlobKey : null,
      };
    } catch {
      return stubResult;
    }
  }
}
