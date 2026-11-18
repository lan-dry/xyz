import type { CdcChange, LogicalChangeStream } from "./types.js";

/**
 * In-memory change stream for unit / red-team tests.
 * Not a production capture path — does not claim independence by itself.
 */
export class SimulatedChangeStream implements LogicalChangeStream {
  readonly kind = "simulated" as const;
  private queue: CdcChange[] = [];
  private waiters: Array<() => void> = [];
  private stopped = false;
  private closed = false;

  push(change: CdcChange): void {
    if (this.stopped) throw new Error("SimulatedChangeStream is stopped");
    this.queue.push(change);
    const w = this.waiters.shift();
    w?.();
  }

  async *changes(): AsyncGenerator<CdcChange, void, undefined> {
    while (!this.stopped || this.queue.length > 0) {
      if (this.queue.length === 0) {
        if (this.closed || this.stopped) return;
        await new Promise<void>((resolve) => this.waiters.push(resolve));
        continue;
      }
      const next = this.queue.shift()!;
      yield next;
    }
  }

  /** Signal that no more pushes will arrive (tests). */
  close(): void {
    this.closed = true;
    this.stopped = true;
    while (this.waiters.length) this.waiters.shift()?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    while (this.waiters.length) this.waiters.shift()?.();
  }
}
