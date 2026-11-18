/**
 * Stage 7: non-blocking plausibility flags.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import "../src/db/load-env.js";
import { closePool, getPool } from "../src/db/pool.js";
import { migrateUp } from "../src/db/migrate.js";
import {
  detectAmountOutlier,
  detectSchemaDrift,
  detectSuddenVolumeChange,
  evaluatePlausibility,
  isOutsideBusinessHours,
  raisePlausibilityFlags,
} from "../src/reconciliation/plausibility.js";
import { listExceptions } from "../src/reconciliation/exceptions.js";
import {
  applyIntegrationFixture,
  INTEGRATION_ORG_A,
} from "./integration-fixture.js";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;
const ORG = INTEGRATION_ORG_A;

describe("plausibility detectors (pure)", () => {
  it("flags outside business hours (weekend / night UTC)", () => {
    expect(isOutsideBusinessHours("2026-11-14T12:00:00.000Z")).toBe(true); // Saturday
    expect(isOutsideBusinessHours("2026-11-18T03:00:00.000Z")).toBe(true); // Wed 03:00
    expect(isOutsideBusinessHours("2026-11-18T10:00:00.000Z")).toBe(false); // Wed 10:00
  });

  it("detects amount outliers against source history", () => {
    const history = [100, 110, 90, 105, 95, 100, 108];
    expect(detectAmountOutlier(100, history)).toBeNull();
    const flag = detectAmountOutlier(10_000_000, history);
    expect(flag?.kind).toBe("amount_outlier");
  });

  it("detects schema drift for novel fields", () => {
    const prior = [
      ["amount", "currency"],
      ["amount", "currency"],
      ["amount", "currency", "product"],
    ];
    expect(detectSchemaDrift(["amount", "currency"], prior)).toBeNull();
    const flag = detectSchemaDrift(["amount", "currency", "weird_new_field"], prior);
    expect(flag?.kind).toBe("schema_drift");
    expect(flag?.detail.unexpected_fields).toContain("weird_new_field");
  });

  it("detects sudden volume change", () => {
    expect(detectSuddenVolumeChange(1, 24, 1, 24)).toBeNull();
    const flag = detectSuddenVolumeChange(50, 2, 1, 24);
    expect(flag?.kind).toBe("sudden_volume_change");
  });

  it("evaluatePlausibility never claims to change an outcome", () => {
    const flags = evaluatePlausibility({
      attributes: { amount: 50_000_000, novel_x: 1 },
      emitted_at: "2026-11-14T22:00:00.000Z",
      amounts: [100, 110, 90, 105, 95, 100, 108],
      attribute_keys: [
        ["amount"],
        ["amount"],
        ["amount"],
      ],
      recent_event_count: 40,
      baseline_event_count: 2,
    });
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => typeof f.title === "string")).toBe(true);
  });
});

describeIfDb("plausibility flags raise exceptions (Stage 7)", () => {
  beforeAll(async () => {
    await migrateUp();
    await applyIntegrationFixture(getPool());
  });

  afterAll(async () => {
    await closePool();
  });

  it("raises non-blocking plausibility_flag exceptions without changing caller outcome", async () => {
    const pool = getPool();
    const caseId = `LN-PLAU-${randomUUID().slice(0, 8)}`;
    const outcomeBefore = "allow";
    const flags = await raisePlausibilityFlags(pool, {
      organization_id: ORG,
      case_id: caseId,
      source_id: "src_plaus_test",
      source_name: "Plaus Test Source",
      attributes: { amount: 42 },
      emitted_at: "2026-11-15T02:00:00.000Z", // Sunday night
      history: {
        amounts: [40, 41, 42, 43, 44],
        attribute_keys: [["amount"], ["amount"], ["amount"]],
        recent_event_count: 1,
      },
    });
    expect(flags.some((f) => f.kind === "outside_business_hours")).toBe(true);
    expect(outcomeBefore).toBe("allow"); // never mutated

    const exceptions = (await listExceptions(pool, ORG)).filter(
      (e) => e.case_id === caseId && e.kind === "plausibility_flag",
    );
    expect(exceptions.length).toBeGreaterThan(0);
    expect(exceptions[0]?.detail).toMatchObject({ non_blocking: true });
  });
});
