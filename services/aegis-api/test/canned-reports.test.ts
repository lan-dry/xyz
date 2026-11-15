import { describe, expect, it, vi } from "vitest";
import {
  csvEscape,
  getCannedReport,
  listCannedReports,
  queryCannedReport,
  rowsToCsv,
} from "../src/forensic/canned-reports.js";

describe("canned reports", () => {
  it("lists the pilot report definitions", () => {
    const reports = listCannedReports();
    expect(reports.map((r) => r.id)).toEqual([
      "decisions_by_outcome",
      "holds_pending",
      "sealed_receipts",
    ]);
    expect(getCannedReport("holds_pending")?.columns).toContain("case_id");
  });

  it("serializes CSV with escaping", () => {
    const csv = rowsToCsv(
      ["a", "b"],
      [
        { a: "plain", b: 1 },
        { a: 'say "hi"', b: "x,y" },
        { a: null, b: "line\nbreak" },
      ],
    );
    expect(csv).toContain("a,b");
    expect(csv).toContain('"say ""hi"""');
    expect(csv).toContain('"x,y"');
    expect(csvEscape(null)).toBe("");
  });

  it("shapes decisions_by_outcome query with org scope", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ outcome: "allow", mode: "enforce", case_count: "2" }],
    });
    const client = { query } as unknown as import("pg").Pool;
    const rows = await queryCannedReport(
      client,
      "org-a",
      "decisions_by_outcome",
    );
    expect(rows).toEqual([
      { outcome: "allow", mode: "enforce", case_count: 2 },
    ]);
    expect(query.mock.calls[0]![0]).toMatch(/FROM bank_case/);
    expect(query.mock.calls[0]![1]).toEqual(["org-a", 5000]);
  });

  it("shapes sealed_receipts query with org scope", async () => {
    const issued = new Date("2026-01-15T10:00:00.000Z");
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          receipt_id: "rcpt_1",
          seq: "1",
          case_id: "c1",
          decision_id: "d1",
          outcome: "allow",
          mode: "enforce",
          receipt_hash: "h1",
          issued_at: issued,
        },
      ],
    });
    const client = { query } as unknown as import("pg").Pool;
    const rows = await queryCannedReport(client, "org-b", "sealed_receipts", 10);
    expect(rows[0]).toMatchObject({
      receipt_id: "rcpt_1",
      seq: 1,
      issued_at: issued.toISOString(),
    });
    expect(query.mock.calls[0]![0]).toMatch(/FROM forensic_receipt/);
    expect(query.mock.calls[0]![1]).toEqual(["org-b", 10]);
  });
});
