import { describe, expect, it } from "vitest";
import { applyFieldPolicy } from "../src/bank/field-policy.js";
import { renderRiskApprovalPdf, type RiskApprovalPack } from "../src/compliance/risk-approval-pack.js";

describe("B5 field policy — applicant_name mask", () => {
  it("masks applicant_name and national_id in stored attributes", () => {
    const fielded = applyFieldPolicy(
      {
        amount: 1_200_000,
        currency: "RWF",
        applicant_name: "Uwase Aline",
        national_id: "1199880045123456",
      },
      [
        { field_path: "national_id", mode: "mask", mask_keep_last: 4 },
        { field_path: "applicant_name", mode: "mask", mask_keep_last: 0 },
      ],
    );
    expect(fielded.stored.applicant_name).toMatch(/^\*+$/);
    expect(String(fielded.stored.national_id)).toMatch(/\*+3456$/);
    expect(fielded.for_evaluate.applicant_name).toBe("Uwase Aline");
  });
});

describe("B3 Risk Approval Pack PDF", () => {
  it("renders a readable PDF without engine vocabulary", () => {
    const pack: RiskApprovalPack = {
      pack_type: "risk_approval_pack",
      generated_at: "2026-11-18T10:00:00.000Z",
      organization: {
        organization_id: "00000000-0000-0000-0000-000000000001",
        name: "Demo Bank",
        slug: "demo-bank",
      },
      authority_matrix: [
        {
          product: "retail_loan",
          currency: "RWF",
          amount_min: 0,
          amount_max: 5_000_000,
          required_role: "Credit Officer",
          outcome: "Allowed",
        },
      ],
      rules: [
        {
          code: "LN-07",
          title: "High model score requires Credit Manager",
          version: 3,
          content_hash: "sha256:abcd",
        },
      ],
      volumes_by_outcome: [{ outcome: "Held for a person", count: 2 }],
      sample_cases: [
        {
          case_id: "LN-RW-0001",
          plain_words: "Allowed; amount RWF 1,200,000",
          outcome: "Allowed",
          amount: "RWF 1,200,000",
          when: "18-11-2026 12:00 (Africa/Kigali)",
        },
      ],
      key_custody: {
        label: "Key custody: software key (demo tenant)",
        key_id: "receipt_dev",
        fingerprint: "sha256:deadbeef",
      },
      time_authority: {
        label: "Public RFC 3161 time authority",
        detail: "Stamps come from a public TSA.",
      },
      sign_off: {
        statement: "I approve this pack for the pilot scope.",
        fields: ["name", "role", "date", "signature"],
      },
    };
    const pdf = renderRiskApprovalPdf(pack);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("Risk Approval Pack");
    expect(text).toContain("Authority matrix");
    expect(text).toContain("LN-07");
    expect(text).toContain("Sign-off");
    expect(text).not.toMatch(/policy_decision|merkle|APS-1/i);
  });
});
