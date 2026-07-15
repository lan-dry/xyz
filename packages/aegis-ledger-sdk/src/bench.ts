import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { record } from "./record.js";
import { replay } from "./replay.js";
import { verify } from "./verify.js";

// P3 target: ≥200 evt/s sustained (dev cluster) — local NDJSON bench only; cloud ingest load TBD.
const ITERATIONS = 10_000;
const dir = mkdtempSync(join(tmpdir(), "aegis-bench-"));
const storePath = join(dir, "events.ndjson");

const sample = {
  actor: { id: "agent:bench", type: "software_agent" },
  action: "decision.record",
  subject: { type: "workflow_step", id: "bench" },
  context: {
    inputs: { n: 1 },
    outcome: { decision: "approve" },
  },
};

const recordStart = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  record(storePath, {
    ...sample,
    context: { inputs: { n: i }, outcome: { decision: "approve" } },
  });
}
const recordMs = performance.now() - recordStart;

const replayStart = performance.now();
replay(storePath);
const replayMs = performance.now() - replayStart;

const verifyStart = performance.now();
verify(storePath);
const verifyMs = performance.now() - verifyStart;

rmSync(dir, { recursive: true, force: true });

console.log(`Aegis local hot path (${ITERATIONS} events)`);
console.log(`  record: ${(recordMs / ITERATIONS).toFixed(4)} ms/event (${recordMs.toFixed(1)} ms total)`);
console.log(`  replay: ${replayMs.toFixed(1)} ms (${ITERATIONS} events)`);
console.log(`  verify: ${verifyMs.toFixed(1)} ms (${ITERATIONS} events)`);
console.log("Target: sub-millisecond record on laptop-class hardware for P0 local slice.");
