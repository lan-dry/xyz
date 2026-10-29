import { NextResponse } from "next/server";
import { verifyEventSignature, type ApsEvent } from "@salanor/aegis";

import {
  SAMPLE_RECEIPT_INTACT,
  SAMPLE_RECEIPT_PUBLIC_KEY_B64,
} from "@/app/verify/sample-receipt";

export const runtime = "nodejs";

function tamperedSample(): ApsEvent {
  const clone = structuredClone(SAMPLE_RECEIPT_INTACT) as unknown as ApsEvent;
  const payload =
    clone.payload && typeof clone.payload === "object"
      ? { ...(clone.payload as Record<string, unknown>) }
      : {};
  payload.amount_usd = 250;
  clone.payload = payload;
  return clone;
}

export async function POST() {
  try {
    const intactOk = await verifyEventSignature(
      SAMPLE_RECEIPT_INTACT as unknown as ApsEvent,
      SAMPLE_RECEIPT_PUBLIC_KEY_B64,
    );
    const tamperedOk = await verifyEventSignature(
      tamperedSample(),
      SAMPLE_RECEIPT_PUBLIC_KEY_B64,
    );

    return NextResponse.json({
      intact: {
        ok: intactOk,
        amount_usd: 249,
        detail: intactOk
          ? "Signature matches the recorded amount and payload."
          : "Unexpected: intact sample failed signature check.",
      },
      tampered: {
        ok: tamperedOk,
        amount_usd: 250,
        detail: tamperedOk
          ? "Unexpected: tampered sample still verified."
          : "Amount changed 249 → 250; signature no longer matches. Chain link broken.",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Tamper demo failed",
      },
      { status: 500 },
    );
  }
}
