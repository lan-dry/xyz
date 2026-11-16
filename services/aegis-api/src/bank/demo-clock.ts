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

/** True only when explicitly enabled and never in production process/env. */
export function isDemoModeAllowed(): boolean {
  if (process.env.AEGIS_DEMO_MODE !== "true") return false;
  const nodeEnv = (process.env.NODE_ENV ?? "").toLowerCase();
  const aegisEnv = (process.env.AEGIS_ENV ?? "").toLowerCase();
  if (nodeEnv === "production" || aegisEnv === "production") return false;
  return true;
}

export function assertDemoMode(operation: string): void {
  if (!isDemoModeAllowed()) {
    throw new DemoClockError(
      `${operation} refused: AEGIS_DEMO_MODE is not enabled, or process is production (NODE_ENV/AEGIS_ENV)`,
    );
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (/prod|production|salanor\.com/i.test(dbUrl) && process.env.AEGIS_ALLOW_DEMO_ON_NAMED_DB !== "true") {
    throw new DemoClockError(
      `${operation} refused: database URL looks non-demo`,
    );
  }
}

/** pg_restore --disable-triggers bypasses append-only; same refuse rule as demo:reset. */
export function assertDisableTriggersRestoreAllowed(): void {
  assertDemoMode("pg_restore --disable-triggers");
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
