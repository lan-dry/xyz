import { describe, expect, it } from "vitest";
import * as ed from "@noble/ed25519";
import {
  LocalFileKeyProvider,
  KeyProviderError,
} from "../src/crypto/key-provider.js";

describe("KeyProvider", () => {
  it("refuses LocalFileKeyProvider in production mode", async () => {
    await expect(
      LocalFileKeyProvider.create({
        keyId: "k1",
        privateKeyB64: Buffer.alloc(32).toString("base64"),
        publicKeyB64: Buffer.alloc(32).toString("base64"),
        nodeEnv: "production",
      }),
    ).rejects.toBeInstanceOf(KeyProviderError);
  });

  it("signs in development", async () => {
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const provider = await LocalFileKeyProvider.create({
      keyId: "k_dev",
      privateKeyB64: Buffer.from(privateKey).toString("base64"),
      publicKeyB64: Buffer.from(publicKey).toString("base64"),
      nodeEnv: "development",
    });
    const digest = new Uint8Array(32).fill(7);
    const { sig_value_b64, key_id } = await provider.sign({
      key_id: "k_dev",
      digest,
    });
    expect(key_id).toBe("k_dev");
    expect(sig_value_b64.length).toBeGreaterThan(20);
    const ok = await ed.verifyAsync(
      Buffer.from(sig_value_b64, "base64"),
      digest,
      publicKey,
    );
    expect(ok).toBe(true);
  });
});
