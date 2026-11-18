/**
 * Bank-ready pass 2 (API side): rules preview + authority matrix view, demo
 * sample bundles + tamper, extended verify checks, receipt access audit,
 * report preview + plain headings, and route auth.
 */
import { describe, expect, it, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { createApp } from "../src/app.js";
import {
  buildAuthorityMatrixView,
  previewBankRules,
  ruleCode,
  ruleDisplayLabel,
} from "../src/bank/rule-preview.js";
import { loadDemoPack, packMatrixRows, packRoles } from "../src/packs/load.js";
import {
  alterOneDigit,
  tamperBundleAmount,
} from "../src/demo/sample-bundles.js";
import {
  buildEvidenceBundle,
  verifyBundleFile,
} from "../src/forensic/evidence-bundle.js";
import {
  buildReceiptBody,
  signForensicReceipt,
} from "../src/forensic/receipt.js";
import {
  auditReceiptAccess,
  caseIdFromPayload,
  RECEIPT_ACCESS_ACTIONS,
} from "../src/console/receipt-access-audit.js";
import {
  displayReportRow,
  getCannedReport,
  previewCannedReport,
  rowsToCsv,
} from "../src/forensic/canned-reports.js";
import { CONSOLE_ROUTE_RULES } from "../src/auth/route-inventory.js";

const pack = loadDemoPack("banking");
const matrix = packMatrixRows(pack);
const ladder = packRoles(pack);
const currency = pack.currencies[0]!;

const RULES = [
  {
    rule_id: "AUTH-RL-1",
    tool_pattern: "governed.action",
    decision: "allow",
    priority: 10,
    policy_id: "pol_v3",
  },
  {
    rule_id: "LN-07",
    tool_pattern: "governed.action",
    decision: "allow_with_obligation",
    priority: 50,
    policy_id: "pol_v3",
    conditions: {
      expr: { gt: ["model.score", 0.7] },
      obligations: { kind: "human_approval", required_role: "credit_manager" },
    },
  },
];

function preview(amount: number, extra: { model_score?: number } = {}) {
  return previewBankRules({
    product: "retail_loan",
    amount,
    currency,
    policy_id: "pol_v3",
    policy_version: 3,
    combine: "all_matching",
    rules: RULES,
    matrix_rows: matrix,
    ladder,
    ...extra,
  });
}

describe("authority matrix view", () => {
  const rows = buildAuthorityMatrixView(matrix, ladder);

  it("labels product, band, role (or above) and rule", () => {
    expect(rows).toHaveLength(matrix.length);
    const low = rows.find((r) => r.matrix_id === "demo_banking_rl_low")!;
    expect(low.product_label).toBe("Loan disbursement");
    expect(low.amount_band).toBe("Under RWF 5,000,000");
    expect(low.required_text).toBe("No approval needed");
    expect(low.rule_label).toBe("AUTH-RL-1 · Within officer limit");

    const mid = rows.find((r) => r.matrix_id === "demo_banking_rl_mid")!;
    expect(mid.amount_band).toBe("RWF 5,000,000 to under RWF 20,000,000");
    expect(mid.required_role_label).toBe("Credit Manager");
    expect(mid.required_text).toBe("Credit Manager or above");
    expect(mid.or_above).toBe(true);
    expect(mid.rule_label).toBe("AUTH-RL-2 · Above officer limit");

    const high = rows.find((r) => r.matrix_id === "demo_banking_rl_high")!;
    expect(high.amount_band).toBe("RWF 20,000,000 and above");
    expect(high.rule_label).toBe("AUTH-RL-HIGH · Above manager band");
  });

  it("never shows raw role keys or policy ids", () => {
    const text = JSON.stringify(rows.map((r) => [r.required_text, r.rule_label, r.risk_label]));
    expect(text).not.toMatch(/credit_manager|pol_/);
  });
});

describe("rule code labels", () => {
  it("strips pack/policy prefixes", () => {
    expect(ruleCode("pol_pack_demo_banking_3b9f7043_LN-07")).toBe("LN-07");
    expect(ruleCode("AUTH-RL-2")).toBe("AUTH-RL-2");
    expect(ruleDisplayLabel("pol_pack_demo_banking_3b9f7043_AUTH-RL-1")).toBe(
      "AUTH-RL-1 · Within officer limit",
    );
  });
});

describe("rules preview (evaluator)", () => {
  it("allows under the officer limit with no approver", () => {
    const p = preview(3_000_000);
    expect(p.outcome).toBe("allow");
    expect(p.deciding_rule.label).toBe("AUTH-RL-1 · Within officer limit");
    expect(p.required_role).toBeNull();
    expect(p.required_text).toBe("No approval needed");
    expect(p.preview_only).toBe(true);
    expect(p.explanation).toMatch(/allowed automatically/);
  });

  it("holds mid-band and names the required role", () => {
    const p = preview(18_000_000);
    expect(p.outcome).toBe("hold");
    expect(p.deciding_rule.code).toBe("AUTH-RL-2");
    expect(p.deciding_rule.source).toBe("authority_matrix");
    expect(p.deciding_rule.label).toBe("AUTH-RL-2 · Above officer limit");
    expect(p.required_role_label).toBe("Credit Manager");
    expect(p.required_text).toBe("Credit Manager or above");
    expect(p.explanation).toMatch(/Credit Manager or above must approve/);
    expect(p.policy_label).toBe("v3");
  });

  it("uses the above-band rule for very large amounts", () => {
    const p = preview(30_000_000);
    expect(p.outcome).toBe("hold");
    expect(p.deciding_rule.label).toBe("AUTH-RL-HIGH · Above manager band");
  });

  it("holds a small amount when a policy rule fires (model score)", () => {
    const p = preview(1_000_000, { model_score: 0.9 });
    expect(p.outcome).toBe("hold");
    expect(p.deciding_rule.code).toBe("LN-07");
    expect(p.deciding_rule.source).toBe("policy_rule");
    expect(p.required_role_label).toBe("Credit Manager");
  });
});

describe("one-digit tamper helper", () => {
  it("changes only the leading digit, never to zero", () => {
    expect(alterOneDigit(5_000_000)).toBe(6_000_000);
    expect(alterOneDigit(9_100_000)).toBe(8_100_000);
    expect(alterOneDigit(1_200_000)).toBe(2_200_000);
  });
});

async function signedBundle(opts: { outcome?: string; withPolicy?: boolean } = {}) {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const keyId = "key_test_pass2";
  const ref = { event_id: "evt_1", event_hash: "sha256:evt1", sequence_num: 1 };
  const body = buildReceiptBody({
    organization_id: "00000000-0000-0000-0000-000000000001",
    seq: 1,
    prev_hash: null,
    case_id: "case-1",
    decision_id: "dec-1",
    product: "retail_loan",
    event_type: "loan_decision",
    outcome: opts.outcome ?? "allow",
    mode: "enforce",
    policy:
      opts.withPolicy === false
        ? undefined
        : { policy_id: "pol_v3", version: 3, content_hash: "sha256:abc" },
    matched_rules: [{ rule_id: "AUTH-RL-1", policy_id: "pol_v3", decision: "allow" }],
    sealed_events: [ref],
    attributes: { amount: 3_200_000, currency: "RWF" },
    key_id: keyId,
    issued_at: "2026-03-01T10:00:01.000Z",
  });
  const signed = await signForensicReceipt(body, Buffer.from(privateKey).toString("base64"));
  return buildEvidenceBundle({
    organization_id: "00000000-0000-0000-0000-000000000001",
    trace_id: "tr_1",
    receipts: [signed],
    sealed_events: [{ ...ref, emitted_at: new Date("2026-03-01T10:00:00.000Z") }],
    keys: { [keyId]: Buffer.from(publicKey).toString("base64") },
    witness: [{ event_id: "evt_1", status: "pending" }],
  });
}

describe("demo sample bundles + verify checklist", () => {
  it("valid bundle passes every check; tampered amount fails with the plain sentence", async () => {
    const bundle = await signedBundle();
    const good = await verifyBundleFile(structuredClone(bundle));
    expect(good.ok).toBe(true);
    const ids = good.checks.map((c) => c.id);
    expect(ids).toEqual([
      "key",
      "facts",
      "signature",
      "chain",
      "sequence",
      "sealed_events",
      "policy_hash",
      "approvals",
      "witness",
      "trusted_time",
      // Stage 2: where the data came from (an information line, never a pass mark for the data).
      "source_of_data",
    ]);
    expect(good.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(good.checks.find((c) => c.id === "source_of_data")?.status).toBe("info");
    expect(good.checks.find((c) => c.id === "witness")?.status).toBe("pending");

    const tampered = tamperBundleAmount(bundle)!;
    expect(tampered.tamper.original).toBe(3_200_000);
    expect(tampered.tamper.altered).toBe(4_200_000);
    expect(tampered.bundle.receipts[0]!.attributes).toMatchObject({ amount: 4_200_000 });
    // The original is untouched (deep copy).
    expect(bundle.receipts[0]!.attributes).toMatchObject({ amount: 3_200_000 });

    const bad = await verifyBundleFile(tampered.bundle);
    expect(bad.ok).toBe(false);
    const facts = bad.checks.find((c) => c.id === "facts")!;
    expect(facts.status).toBe("fail");
    expect(facts.detail).toBe("The amount in this record no longer matches its signature.");
    expect(bad.findings.map((f) => f.message)).toContain(
      "The amount in this record no longer matches its signature.",
    );
  });

  it("policy fingerprint check fails when a cited policy has no hash, info when none cited", async () => {
    const none = await signedBundle({ withPolicy: false });
    const r = await verifyBundleFile(none);
    expect(r.checks.find((c) => c.id === "policy_hash")?.status).toBe("info");
  });

  it("held case without a decided approval is pending, not failed", async () => {
    const held = await signedBundle({ outcome: "hold" });
    const r = await verifyBundleFile(held);
    expect(r.checks.find((c) => c.id === "approvals")?.status).toBe("pending");
    expect(r.ok).toBe(true);
  });
});

describe("demo sample bundles route is is_demo-tenant only", () => {
  // Route keys off organization.is_demo + slug allow-list.
  it("404 for an org slug that is not Demo Bank (no database required)", async () => {
    const res = await createApp().request("/v1/public/demo/sample-bundles?org=northwind");
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("not_a_demo_org");
  });

  it("sampleBundlesAccess requires both allow-listed slug and is_demo=true", async () => {
    const { sampleBundlesAccess, DEMO_BANK_SLUG, DEMO_BANK_REHEARSAL_SLUG } =
      await import("../src/bank/demo-tenant.js");
    expect(sampleBundlesAccess("northwind", true)).toEqual({
      ok: false,
      status: 404,
      error: "not_a_demo_org",
    });
    expect(sampleBundlesAccess(DEMO_BANK_SLUG, false)).toEqual({
      ok: false,
      status: 403,
      error: "not_a_demo_org",
    });
    expect(sampleBundlesAccess(DEMO_BANK_SLUG, null)).toEqual({
      ok: false,
      status: 403,
      error: "not_a_demo_org",
    });
    expect(sampleBundlesAccess(DEMO_BANK_REHEARSAL_SLUG, true)).toEqual({ ok: true });
    expect(sampleBundlesAccess(DEMO_BANK_SLUG, true)).toEqual({ ok: true });
  });
});

describe("new console routes need a session", () => {
  const app = createApp();
  const targets: Array<[string, string, string?]> = [
    ["GET", "/v1/console/authority-matrix"],
    ["GET", "/v1/console/rules/versions"],
    ["POST", "/v1/console/rules/preview", JSON.stringify({ product: "retail_loan", amount: 1 })],
    ["GET", "/v1/console/reports/canned/sealed_receipts/preview"],
  ];
  for (const [method, path, body] of targets) {
    it(`${method} ${path} → 401 without cookie`, async () => {
      const res = await app.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(res.status).toBe(401);
    });
  }

  it("are in the route inventory", () => {
    const keys = new Set(CONSOLE_ROUTE_RULES.map((r) => `${r.method} ${r.path}`));
    for (const [method, path] of targets) {
      const inventoried = path.replace("sealed_receipts", ":reportId");
      expect(keys.has(`${method} ${inventoried}`)).toBe(true);
    }
  });
});

describe("receipt access audit (access log entries)", () => {
  const actor = { organizationId: "org-1", membershipId: "mem-1", email: "a@example.com" };

  it("writes an audit_log row tagged with the case id", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // dedupe lookup
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // insert
    const client = { query } as unknown as import("pg").Pool;
    const r = await auditReceiptAccess(client, actor, {
      action: RECEIPT_ACCESS_ACTIONS.viewed,
      resourceId: "evt_1",
      metadata: { case_id: "case-9", trace_id: "tr_9" },
    });
    expect(r).toBe("written");
    const insert = query.mock.calls[1]!;
    expect(insert[0]).toMatch(/INSERT INTO audit_log/);
    expect(insert[1][0]).toBe("org-1");
    expect(insert[1][2]).toBe("receipt.viewed");
    expect(JSON.parse(insert[1][5])).toMatchObject({
      case_id: "case-9",
      actor_email: "a@example.com",
    });
  });

  it("collapses a repeat open within the window", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 });
    const client = { query } as unknown as import("pg").Pool;
    const r = await auditReceiptAccess(client, actor, {
      action: RECEIPT_ACCESS_ACTIONS.viewed,
      resourceId: "evt_1",
    });
    expect(r).toBe("deduped");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("evidence downloads are never deduped", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const client = { query } as unknown as import("pg").Pool;
    const r = await auditReceiptAccess(client, actor, {
      action: RECEIPT_ACCESS_ACTIONS.evidenceDownloaded,
      resourceId: "case-1",
      resourceType: "case",
      dedupe: false,
    });
    expect(r).toBe("written");
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toMatch(/INSERT INTO audit_log/);
  });

  it("never throws when the log is unavailable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("db down"));
    const client = { query } as unknown as import("pg").Pool;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await auditReceiptAccess(client, actor, {
      action: RECEIPT_ACCESS_ACTIONS.shareOpened,
      resourceId: "shr_1",
    });
    expect(r).toBe("failed");
  });

  it("reads case_id from an event payload", () => {
    expect(caseIdFromPayload({ case_id: " c1 " })).toBe("c1");
    expect(caseIdFromPayload(null)).toBeNull();
    expect(caseIdFromPayload({ case_id: 4 })).toBeNull();
  });
});

describe("reports: preview + plain headings", () => {
  it("every column has a plain heading", () => {
    for (const id of ["decisions_by_outcome", "holds_pending", "sealed_receipts"] as const) {
      const def = getCannedReport(id)!;
      for (const col of def.columns) {
        expect(def.labels[col], `${id}.${col}`).toBeTruthy();
        expect(def.labels[col]).not.toMatch(/_/);
      }
    }
  });

  it("CSV uses plain headings and wording", () => {
    const def = getCannedReport("decisions_by_outcome")!;
    const csv = rowsToCsv(
      def.columns,
      [displayReportRow({ outcome: "hold", mode: "record_only", case_count: 4 })],
      def.labels,
    );
    expect(csv.split("\n")[0]).toBe("Decision,Mode,Number of cases");
    expect(csv).toContain("Held,Recorded only,4");
  });

  it("preview returns first rows and the total", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      outcome: "allow",
      mode: "enforce",
      case_count: String(i),
    }));
    const query = vi.fn().mockResolvedValue({ rows });
    const client = { query } as unknown as import("pg").Pool;
    const p = await previewCannedReport(client, "org-a", "decisions_by_outcome", 5);
    expect(p.total).toBe(12);
    expect(p.rows).toHaveLength(5);
    expect(p.rows[0]).toMatchObject({ outcome: "Allowed", mode: "Enforced" });
    expect(p.columns.map((c) => c.label)).toEqual(["Decision", "Mode", "Number of cases"]);
    expect(query.mock.calls[0]![1][0]).toBe("org-a");
  });
});
