import { describe, expect, it } from "vitest";
import {
  extractPlainText,
  mimeNeedsTextExtract,
} from "../src/attachments/extract-text.js";
import { detectMime } from "../src/attachments/mime.js";

describe("mimeNeedsTextExtract", () => {
  it("covers documents and images that must be reviewed before the model", () => {
    expect(mimeNeedsTextExtract("text/plain")).toBe(true);
    expect(mimeNeedsTextExtract("application/pdf")).toBe(true);
    expect(
      mimeNeedsTextExtract(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(mimeNeedsTextExtract("image/png")).toBe(true);
    expect(mimeNeedsTextExtract("application/zip")).toBe(false);
  });
});

describe("extractPlainText", () => {
  it("reads utf8 text files", async () => {
    const result = await extractPlainText(
      Buffer.from("Client email client@bank.com\n"),
      "text/plain",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain("client@bank.com");
      expect(result.method).toBe("text");
    }
  });

  it("refuses images when OCR is explicitly disabled", async () => {
    const prev = process.env.STOA_ATTACHMENT_OCR;
    process.env.STOA_ATTACHMENT_OCR = "0";
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const result = await extractPlainText(png, "image/png");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/disabled|PDF|DOCX|TXT/i);
    }
    if (prev === undefined) delete process.env.STOA_ATTACHMENT_OCR;
    else process.env.STOA_ATTACHMENT_OCR = prev;
  });
});

describe("detectMime", () => {
  it("detects PDF magic bytes", () => {
    const buf = Buffer.from("%PDF-1.4\n");
    expect(detectMime(buf)).toBe("application/pdf");
  });
});
