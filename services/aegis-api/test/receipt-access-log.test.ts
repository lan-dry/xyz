import { describe, expect, it, vi } from "vitest";
import {
  listReceiptAccess,
  logReceiptAccess,
} from "../src/forensic/access-log.js";

describe("receipt access log", () => {
  it("logReceiptAccess inserts scoped row", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as import("pg").Pool;
    await logReceiptAccess(client, {
      organization_id: "org-1",
      receipt_id: "rcpt_1",
      actor_email: "auditor@example.com",
      action: "view",
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO receipt_access_log/);
    expect(params).toEqual([
      "org-1",
      "rcpt_1",
      null,
      "auditor@example.com",
      "view",
    ]);
  });

  it("listReceiptAccess queries by organization and receipt", async () => {
    const created = new Date("2026-01-15T12:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          access_id: "acc-1",
          actor_email: "a@example.com",
          action: "view",
          created_at: created,
        },
      ],
    });
    const client = { query } as unknown as import("pg").Pool;
    const rows = await listReceiptAccess(client, "org-1", "rcpt_1", 25);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor_email).toBe("a@example.com");
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/FROM receipt_access_log/);
    expect(sql).toMatch(/organization_id = \$1 AND receipt_id = \$2/);
    expect(params).toEqual(["org-1", "rcpt_1", 25]);
  });
});
