import { describe, expect, it } from "vitest";

import {
  assertNoRawSecretInStorage,
  generateApiKeyMaterial,
  hashApiKeySecret,
  verifyApiKeySecret,
} from "./api-keys";

describe("api-keys", () => {
  it("stores bcrypt hash only, never raw secret", async () => {
    const { fullKey, prefix } = generateApiKeyMaterial();
    const secretHash = await hashApiKeySecret(fullKey);
    assertNoRawSecretInStorage(fullKey, { prefix, secretHash });
    expect(secretHash).not.toBe(fullKey);
    expect(await verifyApiKeySecret(fullKey, secretHash)).toBe(true);
    expect(await verifyApiKeySecret("wrong-key", secretHash)).toBe(false);
  });
});
