import { afterEach, describe, expect, it } from "vitest";
import {
  AwsKmsKeyProvider,
  GcpKmsKeyProvider,
  KeyProviderError,
  VaultKeyProvider,
} from "../src/crypto/key-provider.js";

describe("managed KeyProvider Sign failure modes", () => {
  afterEach(() => {
    delete process.env.GCP_KMS_ACCESS_TOKEN;
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;
  });

  it("GcpKmsKeyProvider fails clearly without token", async () => {
    const p = new GcpKmsKeyProvider("k1", "pub", "projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1");
    await expect(
      p.sign({ key_id: "k1", digest: new Uint8Array(32) }),
    ).rejects.toBeInstanceOf(KeyProviderError);
  });

  it("VaultKeyProvider fails clearly without VAULT_ADDR/TOKEN", async () => {
    const p = new VaultKeyProvider("k1", "pub", "transit/aegis");
    await expect(
      p.sign({ key_id: "k1", digest: new Uint8Array(32) }),
    ).rejects.toMatchObject({ name: "KeyProviderError" });
  });

  it("AwsKmsKeyProvider fails clearly without credentials (SDK error wrapped)", async () => {
    const p = new AwsKmsKeyProvider("k1", "pub", "arn:aws:kms:us-east-1:123:key/abc");
    await expect(
      p.sign({ key_id: "k1", digest: new Uint8Array(32) }),
    ).rejects.toBeInstanceOf(KeyProviderError);
  });
});
