/**
 * OCR → DLP spans → paint black boxes on the image.
 * Model still receives redacted *text* only; this produces a cleaned preview
 * and prepares for optional vision later (tenant flag, default off).
 */
import sharp from "sharp";
import { redactForUpstream } from "../dlp/detector.js";
import type { RedactSpan } from "../dlp/redact.js";
import type { DlpProfile } from "../dlp/patterns.js";

export type OcrWord = {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type PixelRedactResult = {
  redactedText: string;
  redactionCount: number;
  redactedPng: Buffer;
  boxesPainted: number;
  ocrMethod: string;
};

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** Map DLP character spans / values onto OCR word bounding boxes. */
export function boxesForRedactionSpans(
  words: OcrWord[],
  spans: RedactSpan[],
): { x0: number; y0: number; x1: number; y1: number }[] {
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const pad = 2;

  for (const span of spans) {
    const target = normalize(span.value);
    if (target.length < 2) continue;

    for (let i = 0; i < words.length; i++) {
      let acc = "";
      let x0 = words[i]!.x0;
      let y0 = words[i]!.y0;
      let x1 = words[i]!.x1;
      let y1 = words[i]!.y1;
      for (let j = i; j < Math.min(words.length, i + 16); j++) {
        const w = words[j]!;
        acc += normalize(w.text);
        x0 = Math.min(x0, w.x0);
        y0 = Math.min(y0, w.y0);
        x1 = Math.max(x1, w.x1);
        y1 = Math.max(y1, w.y1);
        if (acc === target) {
          boxes.push({
            x0: Math.max(0, x0 - pad),
            y0: Math.max(0, y0 - pad),
            x1: x1 + pad,
            y1: y1 + pad,
          });
          break;
        }
        if (acc.length > target.length + 4) break;
      }
    }
  }
  return boxes;
}

type TesseractWord = {
  text?: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

async function runOcr(
  buffer: Buffer,
): Promise<{ text: string; words: OcrWord[] }> {
  const Tesseract = await import("tesseract.js");
  const result = await Tesseract.recognize(buffer, "eng", {
    logger: () => undefined,
  });
  // tesseract.js Page typings omit `words`; runtime includes them.
  const data = result.data as {
    text?: string;
    words?: TesseractWord[];
  };
  const words: OcrWord[] = (data.words ?? [])
    .filter((w) => (w.text ?? "").trim().length > 0)
    .map((w) => ({
      text: w.text ?? "",
      x0: w.bbox.x0,
      y0: w.bbox.y0,
      x1: w.bbox.x1,
      y1: w.bbox.y1,
    }));
  return { text: (data.text ?? "").trim(), words };
}

async function paintBoxes(
  buffer: Buffer,
  boxes: { x0: number; y0: number; x1: number; y1: number }[],
): Promise<Buffer> {
  const image = sharp(buffer);
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height || boxes.length === 0) {
    return image.png().toBuffer();
  }

  const rects = boxes
    .map((b) => {
      const x = Math.max(0, Math.min(width - 1, Math.floor(b.x0)));
      const y = Math.max(0, Math.min(height - 1, Math.floor(b.y0)));
      const w = Math.max(1, Math.min(width - x, Math.ceil(b.x1 - b.x0)));
      const h = Math.max(1, Math.min(height - y, Math.ceil(b.y1 - b.y0)));
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
    })
    .join("");

  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`,
  );

  return image
    .composite([{ input: svg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Full image privacy path: OCR → DLP → black-box paint → redacted PNG + text.
 */
export async function redactImageForUpstream(
  buffer: Buffer,
  dlpProfile: DlpProfile,
): Promise<PixelRedactResult | { error: string }> {
  let text: string;
  let words: OcrWord[];
  try {
    ({ text, words } = await runOcr(buffer));
  } catch (error) {
    console.error("[stoa] image ocr", error);
    return { error: "OCR failed. Upload a PDF, DOCX, or TXT instead." };
  }

  if (!text) {
    return { error: "OCR found no readable text in this image." };
  }

  const redacted = await redactForUpstream(
    text,
    { profile: dlpProfile },
    { timeoutMs: 60_000 },
  );

  const boxes = boxesForRedactionSpans(words, redacted.spans ?? []);
  let redactedPng: Buffer;
  try {
    redactedPng = await paintBoxes(buffer, boxes);
  } catch (error) {
    console.error("[stoa] pixel paint", error);
    return { error: "Could not build a cleaned image preview." };
  }

  return {
    redactedText: redacted.text.replace(
      /\[([A-Z][A-Z0-9_]*?)_\d+\]/g,
      "[$1_WITHHELD]",
    ),
    redactionCount: redacted.redactionCount,
    redactedPng,
    boxesPainted: boxes.length,
    ocrMethod: "tesseract",
  };
}
