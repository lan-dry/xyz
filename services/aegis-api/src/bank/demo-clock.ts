/**
 * Injectable demo clock. Disabled in production (D5).
 */

export class DemoClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoClockError";
  }
}

let offsetMs = 0;
let active = false;

export function isDemoModeAllowed(): boolean {
  return process.env.AEGIS_DEMO_MODE === "true";
}

export function assertDemoMode(operation: string): void {
  if (!isDemoModeAllowed()) {
    throw new DemoClockError(
      `${operation} refused: AEGIS_DEMO_MODE is not enabled (production guard)`,
    );
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (/prod|production|salanor\.com/i.test(dbUrl) && process.env.AEGIS_ALLOW_DEMO_ON_NAMED_DB !== "true") {
    throw new DemoClockError(
      `${operation} refused: database URL looks non-demo`,
    );
  }
}

export function setDemoClock(isoOrOffsetMs: string | number): void {
  assertDemoMode("demo clock");
  if (typeof isoOrOffsetMs === "number") {
    offsetMs = isoOrOffsetMs;
  } else {
    const target = Date.parse(isoOrOffsetMs);
    if (!Number.isFinite(target)) {
      throw new DemoClockError("Invalid demo clock timestamp");
    }
    offsetMs = target - Date.now();
  }
  active = true;
  process.env.AEGIS_DEMO_CLOCK = "true";
}

export function advanceDemoClock(ms: number): void {
  assertDemoMode("demo clock advance");
  offsetMs += ms;
  active = true;
  process.env.AEGIS_DEMO_CLOCK = "true";
}

export function resetDemoClock(): void {
  offsetMs = 0;
  active = false;
  delete process.env.AEGIS_DEMO_CLOCK;
}

export function isDemoClockActive(): boolean {
  return active || process.env.AEGIS_DEMO_CLOCK === "true";
}

export function nowMs(): number {
  return Date.now() + (isDemoClockActive() ? offsetMs : 0);
}

export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}
