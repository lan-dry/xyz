/**
 * Scanned / image-only PDFs: rasterize pages → same OCR + pixel black-box path as images.
 * Digital (text-layer) PDFs stay on the extract → DLP → text-only path.
 */
import sharp from "sharp";
import type { DlpProfile } from "../dlp/patterns.js";
import { redactImageForUpstream, type PixelRedactResult } from "./pixel-redact.js";

const MAX_PDF_OCR_PAGES = 10;
/** Below this, treat as scanned / image-heavy and run page OCR. */
const MIN_EMBEDDED_TEXT_CHARS = 40;

export type PdfRedactResult = {
  redactedText: string;
  redactionCount: number;
  redactedPng: Buffer;
  boxesPainted: number;
  pagesProcessed: number;
  method: string;
};

export function isLikelyScannedPdf(embeddedText: string | null | undefined): boolean {
  const t = (embeddedText ?? "").replace(/\s+/g, " ").trim();
  return t.length < MIN_EMBEDDED_TEXT_CHARS;
}

export async function stitchPngsVertically(pngs: Buffer[]): Promise<Buffer> {
  if (pngs.length === 0) {
    throw new Error("No pages to stitch");
  }
  if (pngs.length === 1) {
    return pngs[0]!;
  }

  const metas = await Promise.all(pngs.map((p) => sharp(p).metadata()));
  const width = Math.max(...metas.map((m) => m.width ?? 0), 1);
  const gap = 8;
  let height = 0;
  for (const m of metas) {
    height += m.height ?? 0;
  }
  height += gap * (pngs.length - 1);

  const composites: { input: Buffer; top: number; left: number }[] = [];
  let top = 0;
  for (let i = 0; i < pngs.length; i++) {
    const h = metas[i]!.height ?? 0;
    const w = metas[i]!.width ?? 0;
    const left = Math.max(0, Math.floor((width - w) / 2));
    composites.push({ input: pngs[i]!, top, left });
    top += h + gap;
  }

  return sharp({
    create: {
      width,
      height: Math.max(height, 1),
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function rasterizePdfPages(buffer: Buffer): Promise<Buffer[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const shots = await parser.getScreenshot({
      first: MAX_PDF_OCR_PAGES,
      scale: 1.5,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const pages: Buffer[] = [];
    for (const page of shots.pages ?? []) {
      if (page.data?.length) {
        pages.push(Buffer.from(page.data));
      }
    }
    return pages;
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

/**
 * OCR + pixel-redact each page of a scanned PDF; stitch cleaned PNGs for preview.
 */
export async function redactScannedPdfForUpstream(
  buffer: Buffer,
  dlpProfile: DlpProfile,
): Promise<PdfRedactResult | { error: string }> {
  let pagePngs: Buffer[];
  try {
    pagePngs = await rasterizePdfPages(buffer);
  } catch (error) {
    console.error("[stoa] pdf rasterize", error);
    return {
      error:
        "Could not render this PDF for OCR. Try a text PDF, DOCX, or image.",
    };
  }

  if (pagePngs.length === 0) {
    return { error: "This PDF has no renderable pages." };
  }

  const pageResults: PixelRedactResult[] = [];
  const textParts: string[] = [];
  let boxesPainted = 0;
  let redactionCount = 0;

  for (let i = 0; i < pagePngs.length; i++) {
    const pixel = await redactImageForUpstream(pagePngs[i]!, dlpProfile);
    if ("error" in pixel) {
      return {
        error: `Page ${i + 1}: ${pixel.error}`,
      };
    }
    pageResults.push(pixel);
    boxesPainted += pixel.boxesPainted;
    redactionCount += pixel.redactionCount;
    textParts.push(`--- Page ${i + 1} ---\n${pixel.redactedText}`);
  }

  let redactedPng: Buffer;
  try {
    redactedPng = await stitchPngsVertically(
      pageResults.map((p) => p.redactedPng),
    );
  } catch (error) {
    console.error("[stoa] pdf stitch", error);
    redactedPng = pageResults[0]!.redactedPng;
  }

  const joined = textParts.join("\n\n").trim();
  if (!joined) {
    return { error: "OCR found no readable text in this PDF." };
  }

  return {
    redactedText: joined,
    redactionCount,
    redactedPng,
    boxesPainted,
    pagesProcessed: pageResults.length,
    method: "pdf-ocr",
  };
}
