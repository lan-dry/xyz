import { describe, expect, it } from "vitest";
import { boxesForRedactionSpans } from "../src/attachments/pixel-redact.js";

describe("boxesForRedactionSpans", () => {
  it("maps a multi-word PII value onto OCR word boxes", () => {
    const words = [
      { text: "Call", x0: 0, y0: 0, x1: 40, y1: 20 },
      { text: "jane@corp.com", x0: 50, y0: 0, x1: 200, y1: 20 },
      { text: "today", x0: 210, y0: 0, x1: 280, y1: 20 },
    ];
    const boxes = boxesForRedactionSpans(words, [
      {
        start: 0,
        end: 13,
        value: "jane@corp.com",
        token: "[EMAIL_1]",
      },
    ]);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.x0).toBeLessThanOrEqual(50);
    expect(boxes[0]!.x1).toBeGreaterThanOrEqual(200);
  });
});
