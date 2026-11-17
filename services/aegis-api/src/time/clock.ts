/**
 * Single time source for approvals, escalation, delegation, receipts, and timers.
 * Production always uses the system clock. Tests may inject a fake via setClockForTests.
 * There is no runtime demo clock or time travel.
 */

export interface Clock {
  now(): Date;
  nowMs(): number;
  nowIso(): string;
}

export const systemClock: Clock = {
  now(): Date {
    return new Date();
  },
  nowMs(): number {
    return Date.now();
  },
  nowIso(): string {
    return new Date().toISOString();
  },
};

let active: Clock = systemClock;

export function getClock(): Clock {
  return active;
}

export function nowMs(): number {
  return active.nowMs();
}

export function nowIso(): string {
  return active.nowIso();
}

export function nowDate(): Date {
  return active.now();
}

/**
 * Test-only clock injection. Refused when AEGIS_ENV=production.
 * Pass null to restore the system clock.
 */
export function setClockForTests(clock: Clock | null): void {
  const aegisEnv = (process.env.AEGIS_ENV ?? "").trim().toLowerCase();
  if (aegisEnv === "production") {
    throw new Error("setClockForTests refused when AEGIS_ENV=production");
  }
  active = clock ?? systemClock;
}

/** True when AEGIS_DEMO_MODE is set (ignored at runtime; logged once at boot). */
export function isLegacyDemoModeEnvSet(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.AEGIS_DEMO_MODE ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}
