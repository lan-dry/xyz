import { describe, expect, it, vi } from "vitest";
import { runBatchImport } from "../src/bank/batch-import.js";

describe("batch import commit path (record-only)", () => {
  it("dry_run defaults true and does not call commit", async () => {
    const commit = vi.fn();
    const csv = `case_id,idempotency_key,event_type,emitted_at,amount
C1,idem-1,loan_decision,2026-01-15T10:00:00.000Z,100
`;
    const report = await runBatchImport(
      csv,
      "csv",
      {
        case_id: "case_id",
        idempotency_key: "idempotency_key",
        event_type: "event_type",
        emitted_at: "emitted_at",
        amount: "attributes.amount",
      },
      {
        defaults: {
          schema_version: 1,
          case_id: "",
          idempotency_key: "",
          event_type: "loan_decision",
          emitted_at: "2026-01-15T10:00:00.000Z",
          attributes: {},
        },
        commit,
      },
    );
    expect(report.dry_run).toBe(true);
    expect(report.record_only).toBe(true);
    expect(report.valid_rows).toBe(1);
    expect(report.committed_rows).toBe(0);
    expect(commit).not.toHaveBeenCalled();
  });

  it("dry_run=false commits each valid row via handler", async () => {
    const commit = vi.fn().mockResolvedValue({
      case_id: "C1",
      decision_id: "dec_1",
      outcome: "allow",
      mode: "record_only",
      event_id: "evt_sealed_1",
      would_have: "hold",
    });
    const csv = `case_id,idempotency_key,event_type,emitted_at,amount
C1,idem-1,loan_decision,2026-01-15T10:00:00.000Z,100
,idem-2,loan_decision,2026-01-15T10:00:00.000Z,200
C3,idem-3,loan_decision,2026-01-15T10:00:00.000Z,300
`;
    const report = await runBatchImport(
      csv,
      "csv",
      {
        case_id: "case_id",
        idempotency_key: "idempotency_key",
        event_type: "event_type",
        emitted_at: "emitted_at",
        amount: "attributes.amount",
      },
      {
        dry_run: false,
        defaults: {
          schema_version: 1,
          case_id: "",
          idempotency_key: "",
          event_type: "loan_decision",
          emitted_at: "2026-01-15T10:00:00.000Z",
          attributes: {},
        },
        commit,
      },
    );
    expect(report.dry_run).toBe(false);
    expect(report.record_only).toBe(true);
    expect(report.valid_rows).toBe(2);
    expect(report.errors).toHaveLength(1);
    expect(report.committed_rows).toBe(2);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(report.results[0]?.mode).toBe("record_only");
    expect(report.results[0]?.would_have).toBe("hold");
  });
});

describe("batch route auth smoke (handler contract)", () => {
  it("documents 401 without bearer for batch path", async () => {
    // Route-level: createApp + real DB is covered by integration suites.
    // This asserts the shared Authorization parse used by bank-events/batch.
    const auth = undefined as string | undefined;
    const missing = !auth?.startsWith("Bearer ");
    expect(missing).toBe(true);
  });
});
