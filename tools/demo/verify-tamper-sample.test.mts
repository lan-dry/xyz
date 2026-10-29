import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyEventSignature, type ApsEvent } from "@salanor/aegis";
import {
  SAMPLE_RECEIPT_INTACT,
  SAMPLE_RECEIPT_PUBLIC_KEY_B64,
} from "../../apps/web-console/src/app/verify/sample-receipt.ts";

describe("verify tamper sample", () => {
  it("intact sample verifies and amount edit fails", async () => {
    const intact = await verifyEventSignature(
      SAMPLE_RECEIPT_INTACT as unknown as ApsEvent,
      SAMPLE_RECEIPT_PUBLIC_KEY_B64,
    );
    assert.equal(intact, true);

    const tampered = structuredClone(SAMPLE_RECEIPT_INTACT) as unknown as ApsEvent;
    tampered.payload = {
      ...(tampered.payload as Record<string, unknown>),
      amount_usd: 250,
    };
    const bad = await verifyEventSignature(tampered, SAMPLE_RECEIPT_PUBLIC_KEY_B64);
    assert.equal(bad, false);
  });
});
