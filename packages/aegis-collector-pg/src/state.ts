import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CollectorStateSnapshot = {
  source_id: string;
  last_seq: number;
  /** Last confirmed LSN (string) or null before first change. */
  last_lsn: string | null;
};

export class CollectorState {
  private constructor(
    readonly dir: string,
    private snapshot: CollectorStateSnapshot,
  ) {}

  static async open(dir: string, sourceId: string): Promise<CollectorState> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, "state.json");
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as CollectorStateSnapshot;
      if (raw.source_id !== sourceId) {
        throw new Error(
          `State dir belongs to source ${raw.source_id}, not ${sourceId}`,
        );
      }
      return new CollectorState(dir, {
        source_id: sourceId,
        last_seq: Number(raw.last_seq) || 0,
        last_lsn: raw.last_lsn ?? null,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      const fresh: CollectorStateSnapshot = {
        source_id: sourceId,
        last_seq: 0,
        last_lsn: null,
      };
      const state = new CollectorState(dir, fresh);
      await state.flush();
      return state;
    }
  }

  get lastSeq(): number {
    return this.snapshot.last_seq;
  }

  get lastLsn(): string | null {
    return this.snapshot.last_lsn;
  }

  nextSeq(): number {
    this.snapshot.last_seq += 1;
    return this.snapshot.last_seq;
  }

  async recordLsn(lsn: string): Promise<void> {
    this.snapshot.last_lsn = lsn;
    await this.flush();
  }

  private async flush(): Promise<void> {
    await writeFile(
      join(this.dir, "state.json"),
      JSON.stringify(this.snapshot, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
}
