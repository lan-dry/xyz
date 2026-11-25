import { describe, expect, it } from "vitest";
import {
  canDecideApprovals,
  canManageIngestKeys,
  canReadOrgConsole,
  canWriteOrgConsole,
  isOrgConsoleReadOnly,
  isSandboxInviteRole,
} from "./org-console-access.js";
import type { ConsoleSession } from "./session.js";

function session(role: string): ConsoleSession {
  return {
    sessionId: "sess-1",
    userId: "mem-1",
    accountId: "acc-1",
    organizationId: "org-1",
    email: "u@example.com",
    displayName: "U",
    role,
  };
}

describe("org-console-access", () => {
  it("allows read for auditor and engineer", () => {
    expect(canReadOrgConsole(session("auditor"), "org-1")).toBe(true);
    expect(canReadOrgConsole(session("engineer"), "org-1")).toBe(true);
    expect(canWriteOrgConsole(session("auditor"), "org-1")).toBe(false);
  });

  it("allows write only for admin and owner", () => {
    expect(canWriteOrgConsole(session("admin"), "org-1")).toBe(true);
    expect(canWriteOrgConsole(session("owner"), "org-1")).toBe(true);
    expect(canWriteOrgConsole(session("viewer"), "org-1")).toBe(false);
  });

  it("lets Approver decide approvals without org write", () => {
    expect(canDecideApprovals(session("approver"), "org-1")).toBe(true);
    expect(canWriteOrgConsole(session("approver"), "org-1")).toBe(false);
    expect(canDecideApprovals(session("auditor"), "org-1")).toBe(false);
  });

  it("lets admin/owner manage keys; blocks approver and auditor", () => {
    expect(canManageIngestKeys(session("admin"), "org-1")).toBe(true);
    expect(canManageIngestKeys(session("owner"), "org-1")).toBe(true);
    expect(canManageIngestKeys(session("approver"), "org-1")).toBe(false);
    expect(canManageIngestKeys(session("auditor"), "org-1")).toBe(false);
  });

  it("limits sandbox invite roles to admin, approver, auditor", () => {
    expect(isSandboxInviteRole("admin")).toBe(true);
    expect(isSandboxInviteRole("approver")).toBe(true);
    expect(isSandboxInviteRole("auditor")).toBe(true);
    expect(isSandboxInviteRole("owner")).toBe(false);
    expect(isSandboxInviteRole("engineer")).toBe(false);
    expect(isSandboxInviteRole("viewer")).toBe(false);
  });

  it("blocks cross-org access", () => {
    expect(canReadOrgConsole(session("admin"), "org-2")).toBe(false);
  });

  it("marks auditor as read-only", () => {
    expect(isOrgConsoleReadOnly(session("auditor"), "org-1")).toBe(true);
    expect(isOrgConsoleReadOnly(session("admin"), "org-1")).toBe(false);
  });
});
