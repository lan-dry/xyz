import { describe, expect, it, vi } from "vitest";
import speakeasy from "@levminer/speakeasy";

import {
  confirmEnrollmentForUser,
  deriveTotpEnrollmentState,
  startEnrollmentForUser,
  type UserTotpProjection,
} from "./enrollment";
import { decryptTotpSecret, encryptTotpSecret } from "./crypto";

function makeMockPrisma(user: UserTotpProjection) {
  const state = { user: { ...user } };
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ ...state.user })),
      update: vi.fn(async ({ data }: { data: Partial<UserTotpProjection> }) => {
        state.user = { ...state.user, ...data };
        return { ...state.user };
      }),
    },
  };
  return { prisma, state };
}

describe("totp enrollment state machine", () => {
  it("moves disabled -> pending -> enabled", async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    const { prisma, state } = makeMockPrisma({
      id: "user-1",
      email: "founder@salanor.test",
      totpSecretEnc: null,
      totpEnabledAt: null,
    });

    expect(deriveTotpEnrollmentState(state.user)).toBe("disabled");
    await startEnrollmentForUser(prisma, state.user.id);
    expect(deriveTotpEnrollmentState(state.user)).toBe("pending");

    const secret = state.user.totpSecretEnc!;
    const code = speakeasy.totp({ secret: decryptTotpSecret(secret), encoding: "base32" });
    const confirmed = await confirmEnrollmentForUser(prisma, state.user.id, code);

    expect(confirmed).toBe(true);
    expect(deriveTotpEnrollmentState(state.user)).toBe("enabled");
  });

  it("rejects wrong confirmation code", async () => {
    process.env.AUTH_SECRET = "test-auth-secret";
    const { prisma, state } = makeMockPrisma({
      id: "user-2",
      email: "ops@salanor.test",
      totpSecretEnc: encryptTotpSecret("JBSWY3DPEHPK3PXP"),
      totpEnabledAt: null,
    });

    const confirmed = await confirmEnrollmentForUser(prisma, state.user.id, "000000");
    expect(confirmed).toBe(false);
    expect(state.user.totpEnabledAt).toBeNull();
  });
});
