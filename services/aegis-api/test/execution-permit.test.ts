import { describe, expect, it } from "vitest";
import {
  actionSnapshotFromPayload,
  approvedActionMatches,
  digestActionSnapshot,
} from "../src/approvals/action-digest.js";
import { evaluateExecutionPermit } from "../src/execution/permit.js";

type FakeRow = {
  receipt_id: string;
  receipt_hash: string;
  case_id: string;
  outcome: string;
  body: Record<string, unknown>;
  seq: number;
};

function fakeClient(receipts: FakeRow[], caseByTrace?: Record<string, string>) {
  return {
    async query(sql: string, params: unknown[]) {
      if (sql.includes("FROM bank_case")) {
        const traceId = String(params[1] ?? "");
        const caseId = caseByTrace?.[traceId];
        return { rows: caseId ? [{ case_id: caseId }] : [] };
      }
      if (sql.includes("FROM forensic_receipt")) {
        const caseId = String(params[1] ?? "");
        return {
          rows: receipts
            .filter((r) => r.case_id === caseId)
            .sort((a, b) => a.seq - b.seq),
        };
      }
      return { rows: [] };
    },
  };
}

describe("execution permit digest binding", () => {
  it("matches sealed amount/beneficiary", () => {
    const sealed = actionSnapshotFromPayload({
      amount: 18_000_000,
      currency: "RWF",
      beneficiary: "ACCT-1",
    });
    const ok = approvedActionMatches(sealed, {
      amount: 18_000_000,
      currency: "RWF",
      beneficiary: "ACCT-1",
    });
    expect(ok.match).toBe(true);
    const bad = approvedActionMatches(sealed, {
      amount: 1,
      currency: "RWF",
      beneficiary: "ACCT-1",
    });
    expect(bad.match).toBe(false);
    expect(digestActionSnapshot(sealed)).toHaveLength(64);
  });
});

describe("evaluateExecutionPermit", () => {
  const org = "org_test";
  const caseId = "LN-RW-2026-00405";

  it("denies when still held", async () => {
    const client = fakeClient([
      {
        receipt_id: "rcpt_hold",
        receipt_hash: "sha256:h",
        case_id: caseId,
        outcome: "hold",
        seq: 1,
        body: { attributes: { amount: 100, currency: "RWF" } },
      },
    ]);
    const r = await evaluateExecutionPermit(client as never, org, {
      case_id: caseId,
      action: { amount: 100, currency: "RWF" },
    });
    expect(r.permitted).toBe(false);
    expect(r.code).toBe("held");
  });

  it("permits after approved when digest matches", async () => {
    const client = fakeClient([
      {
        receipt_id: "rcpt_hold",
        receipt_hash: "sha256:h",
        case_id: caseId,
        outcome: "hold",
        seq: 1,
        body: { attributes: { amount: 100, currency: "RWF", beneficiary: "B1" } },
      },
      {
        receipt_id: "rcpt_ok",
        receipt_hash: "sha256:a",
        case_id: caseId,
        outcome: "approved",
        seq: 2,
        body: {
          attributes: { amount: 100, currency: "RWF", beneficiary: "B1" },
        },
      },
    ]);
    const r = await evaluateExecutionPermit(client as never, org, {
      case_id: caseId,
      action: { amount: 100, currency: "RWF", beneficiary: "B1" },
    });
    expect(r.permitted).toBe(true);
    expect(r.receipt_id).toBe("rcpt_ok");
  });

  it("denies digest mismatch after approve", async () => {
    const client = fakeClient([
      {
        receipt_id: "rcpt_ok",
        receipt_hash: "sha256:a",
        case_id: caseId,
        outcome: "approved",
        seq: 1,
        body: {
          attributes: { amount: 100, currency: "RWF", beneficiary: "B1" },
        },
      },
    ]);
    const r = await evaluateExecutionPermit(client as never, org, {
      case_id: caseId,
      action: { amount: 999, currency: "RWF", beneficiary: "B1" },
    });
    expect(r.permitted).toBe(false);
    expect(r.code).toBe("digest_mismatch");
  });

  it("denies declined and stop", async () => {
    for (const outcome of ["declined", "stop"] as const) {
      const client = fakeClient([
        {
          receipt_id: "rcpt_x",
          receipt_hash: "sha256:x",
          case_id: caseId,
          outcome,
          seq: 1,
          body: { attributes: { amount: 1 } },
        },
      ]);
      const r = await evaluateExecutionPermit(client as never, org, {
        case_id: caseId,
        action: { amount: 1 },
      });
      expect(r.permitted).toBe(false);
      expect(["declined", "stopped"]).toContain(r.code);
    }
  });

  it("resolves case via trace_id", async () => {
    const client = fakeClient(
      [
        {
          receipt_id: "rcpt_allow",
          receipt_hash: "sha256:a",
          case_id: caseId,
          outcome: "allow",
          seq: 1,
          body: { attributes: { amount: 50, currency: "RWF" } },
        },
      ],
      { "TR-RW-2026-00405": caseId },
    );
    const r = await evaluateExecutionPermit(client as never, org, {
      trace_id: "TR-RW-2026-00405",
      action: { amount: 50, currency: "RWF" },
    });
    expect(r.permitted).toBe(true);
    expect(r.case_id).toBe(caseId);
  });
});
