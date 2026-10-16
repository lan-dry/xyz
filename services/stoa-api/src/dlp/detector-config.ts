export function detectorUrl(): string | null {
  return process.env.STOA_PII_DETECTOR_URL?.trim().replace(/\/$/, "") || null;
}

export function detectorEnabled(): boolean {
  return detectorUrl() !== null;
}
