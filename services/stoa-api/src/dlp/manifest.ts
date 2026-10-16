import { GROUP_LABELS } from "./public-summary.js";
import type { PatternGroup } from "./patterns.js";

export type ManifestGroup = PatternGroup | "custom_term" | "custom_pattern";

export type RedactionManifestEntry = {
  group: ManifestGroup;
  label: string;
  count: number;
};

const CUSTOM_LABELS: Record<"custom_term" | "custom_pattern", string> = {
  custom_term: "Confidential words",
  custom_pattern: "Organization rules",
};

export function manifestGroupLabel(group: ManifestGroup): string {
  return group === "custom_term" || group === "custom_pattern"
    ? CUSTOM_LABELS[group]
    : GROUP_LABELS[group];
}

export function buildRedactionManifest(
  counts: Map<ManifestGroup, number>,
): RedactionManifestEntry[] {
  const out: RedactionManifestEntry[] = [];
  for (const [group, count] of counts) {
    if (count <= 0) {
      continue;
    }
    out.push({ group, label: manifestGroupLabel(group), count });
  }
  return out;
}
