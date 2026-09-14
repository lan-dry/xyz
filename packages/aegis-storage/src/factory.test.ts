import { afterEach, describe, expect, it } from "vitest";

import { createBlobStore, loadBlobStoreConfig } from "./factory";

describe("loadBlobStoreConfig", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("requires S3 env when kind is s3", () => {
    process.env.AEGIS_BLOB_STORE = "s3";
    delete process.env.AEGIS_S3_ENDPOINT;
    expect(() => loadBlobStoreConfig()).toThrow(/AEGIS_S3_ENDPOINT/);
  });

  it("creates null store for none", () => {
    process.env.AEGIS_BLOB_STORE = "none";
    expect(createBlobStore()).toBeNull();
  });
});
