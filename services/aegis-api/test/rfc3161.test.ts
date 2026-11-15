import { describe, expect, it } from "vitest";
import {
  createLocalTestTimestamp,
  reportCheckpointTimestamp,
  verifyLocalTestTimestamp,
} from "../src/forensic/rfc3161.js";

describe("RFC 3161 local test TSA", () => {
  it("creates and verifies a local timestamp token", () => {
    const hash = "abc123";
    const token = createLocalTestTimestamp(hash);
    expect(verifyLocalTestTimestamp(token, hash).ok).toBe(true);
    expect(verifyLocalTestTimestamp(token, "other").ok).toBe(false);
  });

  it("reports absence plainly", () => {
    const report = reportCheckpointTimestamp(null, "head");
    expect(report.present).toBe(false);
    expect(report.message).toMatch(/No RFC 3161/);
  });
});
