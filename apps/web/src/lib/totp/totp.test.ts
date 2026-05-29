import { afterEach, describe, expect, it, vi } from "vitest";
import speakeasy from "@levminer/speakeasy";

import { decryptTotpSecret, encryptTotpSecret } from "./crypto";
import { verifyTotpCode } from "./totp";

describe("totp helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies a valid TOTP code", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    const code = speakeasy.totp({ secret, encoding: "base32" });
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
    const secret = speakeasy.generateSecret({ length: 20 }).base32;
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("encrypts and decrypts TOTP secret", () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
  });
});
