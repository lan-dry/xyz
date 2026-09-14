import { describe, expect, it, vi } from "vitest";

import {
  generateInviteToken,
  getInviteCreationBlockReason,
  hashInviteToken,
  inviteExpiryDate,
  isValidInviteToken,
} from "./invites";

describe("invites", () => {
  it("generates random token with deterministic hash", () => {
    const first = generateInviteToken();
    const second = generateInviteToken();

    expect(isValidInviteToken(first.token)).toBe(true);
    expect(first.tokenHash).toBe(hashInviteToken(first.token));
    expect(first.token).not.toBe(second.token);
  });

  it("rejects malformed token formats", () => {
    expect(isValidInviteToken("")).toBe(false);
    expect(isValidInviteToken("short-token")).toBe(false);
    expect(isValidInviteToken("z".repeat(64))).toBe(false);
  });

  it("sets invite expiry in the future", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expires = inviteExpiryDate(now);
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
  });

  it("blocks invite when email is already a member", async () => {
    const db = {
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }),
      },
      organizationInvite: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const reason = await getInviteCreationBlockReason(
      db,
      "org-1",
      "JLandryf@gmail.com",
    );
    expect(reason).toBe("already_member");
    expect(db.organizationMembership.findFirst).toHaveBeenCalledOnce();
    expect(db.organizationInvite.findFirst).toHaveBeenCalledOnce();
  });

  it("blocks duplicate pending invite for same org/email", async () => {
    const db = {
      organizationMembership: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      organizationInvite: {
        findFirst: vi.fn().mockResolvedValue({ id: "invite-1" }),
      },
    };

    const reason = await getInviteCreationBlockReason(
      db,
      "org-1",
      "jlandryf@gmail.com",
    );
    expect(reason).toBe("already_invited");
  });
});
