import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LocalBlobStore, contentAddressKey, putContentAddressed } from "./local";

describe("LocalBlobStore", () => {
  it("stores and retrieves content-addressed blobs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aegis-blob-"));
    const store = new LocalBlobStore({ rootDir: dir });
    try {
      const payload = Buffer.from('{"event":"test"}', "utf8");
      const { key } = await putContentAddressed(store, payload);
      expect(key).toBe(contentAddressKey(payload));
      const roundTrip = await store.get(key);
      expect(roundTrip?.toString("utf8")).toBe(payload.toString("utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
