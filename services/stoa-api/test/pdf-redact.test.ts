import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  isLikelyScannedPdf,
  stitchPngsVertically,
} from "../src/attachments/pdf-redact.js";

describe("isLikelyScannedPdf", () => {
  it("flags empty or tiny embedded text as scanned", () => {
    expect(isLikelyScannedPdf("")).toBe(true);
    expect(isLikelyScannedPdf("   ")).toBe(true);
    expect(isLikelyScannedPdf("Page 1")).toBe(true);
  });

  it("treats substantial embedded text as digital", () => {
    const body =
      "This account statement includes transaction history and balances for review.";
    expect(isLikelyScannedPdf(body)).toBe(false);
  });
});

describe("stitchPngsVertically", () => {
  it("stacks two PNGs into one taller image", async () => {
    const a = await sharp({
      create: {
        width: 40,
        height: 20,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const b = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const out = await stitchPngsVertically([a, b]);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(40);
    expect(meta.height).toBeGreaterThanOrEqual(50);
  });
});
