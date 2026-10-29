const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF….WEBP checked below
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function detectMime(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const off = sig.offset ?? 0;
    if (buffer.length < off + sig.bytes.length) {
      continue;
    }
    if (sig.bytes.every((b, i) => buffer[off + i] === b)) {
      if (sig.mime === "image/webp") {
        const tag = buffer.subarray(8, 12).toString("ascii");
        if (tag !== "WEBP") continue;
      }
      return sig.mime;
    }
  }
  // DOCX is a ZIP containing word/
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer.subarray(0, Math.min(buffer.length, 8192)).toString("binary").includes("word/")
  ) {
    return DOCX_MIME;
  }
  const asText = buffer.subarray(0, Math.min(512, buffer.length)).toString("utf8");
  if (/^[\t\n\r\x20-\x7e]+$/.test(asText)) {
    return "text/plain";
  }
  return null;
}

export function mimeAllowed(
  detected: string,
  declared: string,
  allowList: string[],
): boolean {
  const normalized = detected || declared;
  return allowList.some(
    (m) => m.toLowerCase() === normalized.toLowerCase(),
  );
}
