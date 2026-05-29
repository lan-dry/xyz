import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStubChainForTests } from "./anchor";
import { OpenTimestampsAnchorProvider } from "./ots-anchor";

describe("OpenTimestampsAnchorProvider", () => {
  beforeEach(() => {
    resetStubChainForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns pending when calendar accepts digest", async () => {
    const merkleRoot = "a".repeat(64);
    vi.mocked(fetch).mockResolvedValue(
      new Response(Buffer.from("ots-proof"), { status: 200 }),
    );

    const blob = {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      has: vi.fn(),
    };

    const provider = new OpenTimestampsAnchorProvider(undefined, blob, {
      calendarUrl: "https://calendar.test",
    });
    const result = await provider.anchorBatch({ merkleRoot, eventCount: 1 });

    expect(result.anchorStatus).toBe("pending");
    expect(result.anchorRef).toMatch(/^ots:/);
    expect(blob.put).toHaveBeenCalled();
  });

  it("falls back to stub when calendar fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    const provider = new OpenTimestampsAnchorProvider(undefined, null, {
      calendarUrl: "https://calendar.test",
    });
    const merkleRoot = "b".repeat(64);
    const result = await provider.anchorBatch({ merkleRoot, eventCount: 1 });

    expect(result.anchorStatus).toBe("stub");
  });

  it("returns stub when disabled", async () => {
    const provider = new OpenTimestampsAnchorProvider(undefined, null, { disabled: true });
    const merkleRoot = "c".repeat(64);
    const result = await provider.anchorBatch({ merkleRoot, eventCount: 1 });
    expect(result.anchorStatus).toBe("stub");
    expect(fetch).not.toHaveBeenCalled();
  });
});
