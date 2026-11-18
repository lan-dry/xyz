import { describe, expect, it } from "vitest";
import {
  isExternallyAnchored,
  witnessCheckpointLabel,
} from "../src/witness/label.js";

describe("witnessCheckpointLabel", () => {
  it("uses Salanor wording for internal roots", () => {
    expect(witnessCheckpointLabel(null)).toBe(
      "Salanor witness checkpoint (signed)",
    );
    expect(witnessCheckpointLabel("internal")).toBe(
      "Salanor witness checkpoint (signed)",
    );
    expect(isExternallyAnchored("internal")).toBe(false);
  });

  it("names external anchors explicitly", () => {
    expect(witnessCheckpointLabel("bitcoin")).toBe(
      "Externally anchored witness checkpoint (bitcoin)",
    );
    expect(isExternallyAnchored("ethereum")).toBe(true);
  });
});
