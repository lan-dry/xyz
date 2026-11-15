import { describe, expect, it } from "vitest";
import {
  dryRunBatch,
  parseCsv,
  rowsToBankEvents,
} from "../src/bank/batch-import.js";

describe("batch import", () => {
  it("maps CSV columns and validates rows", () => {
    const csv = `LoanID,Amount,Currency,Idem
L-1,3000000,RWF,idem-1
,4000000,RWF,idem-2
`;
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    const { events, errors } = rowsToBankEvents(rows, {
      mapping: {
        LoanID: "case_id",
        Amount: "attributes.amount",
        Currency: "attributes.currency",
        Idem: "idempotency_key",
      },
      defaults: {
        schema_version: 1,
        event_type: "loan_decision",
        product: "retail_loan",
        emitted_at: "2026-01-15T10:00:00.000Z",
        case_id: "",
        idempotency_key: "",
        attributes: {},
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.case_id).toBe("L-1");
    expect(events[0]!.attributes.amount).toBe("3000000");
    expect(errors).toHaveLength(1);
  });

  it("dry-run reports valid and invalid", () => {
    const jsonl = [
      JSON.stringify({
        case_id: "c1",
        idempotency_key: "i1",
        event_type: "loan_decision",
        emitted_at: "2026-01-15T10:00:00.000Z",
        amount: 100,
      }),
      JSON.stringify({ case_id: "c2" }),
    ].join("\n");
    const report = dryRunBatch(
      jsonl,
      "jsonl",
      {
        case_id: "case_id",
        idempotency_key: "idempotency_key",
        event_type: "event_type",
        emitted_at: "emitted_at",
        amount: "attributes.amount",
      },
      {
        schema_version: 1,
        case_id: "",
        idempotency_key: "",
        event_type: "loan_decision",
        emitted_at: "2026-01-15T10:00:00.000Z",
        attributes: {},
      },
    );
    expect(report.total_rows).toBe(2);
    expect(report.valid_rows).toBe(1);
    expect(report.errors).toHaveLength(1);
  });
});
