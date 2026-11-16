/**
 * Minimal one-page PDF writer. No dependencies, no external assets.
 * Plain text only (built-in Helvetica / Helvetica-Bold, WinAnsi).
 */

export type PdfLine = {
  text: string;
  bold?: boolean;
  size?: number;
  /** Extra vertical gap before the line, in points. */
  gapBefore?: number;
};

const PAGE_W = 595; // A4
const PAGE_H = 842;
const MARGIN = 48;

/** Keep printable Latin-1; replace everything else so the byte stream stays valid. */
export function pdfSafeText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (ch === "\t") out += "    ";
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x2013 || code === 0x2014) out += "-";
    else if (code === 0x2026) out += "...";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa1 && code <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

function escapePdf(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Rough Helvetica width: average glyph ~0.5em; good enough for wrapping. */
function maxCharsPerLine(size: number): number {
  const usable = PAGE_W - MARGIN * 2;
  return Math.max(10, Math.floor(usable / (size * 0.5)));
}

export function wrapText(text: string, size: number): string[] {
  const max = maxCharsPerLine(size);
  const out: string[] = [];
  for (const para of pdfSafeText(text).split("\n")) {
    if (para.length <= max) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      // Hard-break long tokens (hashes, base64).
      while (w.length > max) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if (line.length + 1 + w.length <= max) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Render lines onto a single A4 page. Lines beyond the page are dropped. */
export function renderOnePagePdf(lines: PdfLine[], title = "Aegis evidence"): Buffer {
  const content: string[] = [];
  let y = PAGE_H - MARGIN;
  outer: for (const l of lines) {
    const size = l.size ?? 10;
    const leading = size * 1.35;
    y -= l.gapBefore ?? 0;
    for (const piece of wrapText(l.text, size)) {
      if (y - leading < MARGIN) break outer;
      y -= leading;
      content.push(
        `BT /${l.bold ? "F2" : "F1"} ${size} Tf ${MARGIN} ${y.toFixed(2)} Td (${escapePdf(piece)}) Tj ET`,
      );
    }
  }
  const stream = content.join("\n");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
  );
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  objects.push(`<< /Title (${escapePdf(pdfSafeText(title))}) /Producer (Salanor Aegis) >>`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
