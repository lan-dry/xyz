const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
];

export function detectMime(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const off = sig.offset ?? 0;
    if (buffer.length < off + sig.bytes.length) {
      continue;
    }
    if (sig.bytes.every((b, i) => buffer[off + i] === b)) {
      return sig.mime;
    }
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
