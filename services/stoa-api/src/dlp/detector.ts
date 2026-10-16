import { detectorEnabled, detectorUrl } from "./detector-config.js";
import { MODEL_GROUPS, type ModelGroup } from "./patterns.js";
import { redactPrompt, type DetectedSpan, type RedactOptions } from "./redact.js";

/** Raised when the detector is configured but cannot be reached; callers must not send. */
export class PrivacyCheckUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Privacy check is unavailable. Try again in a moment.");
    this.name = "PrivacyCheckUnavailableError";
    this.cause = cause;
  }
}

const LABEL_GROUPS: Record<string, ModelGroup> = {
  person: "person",
  full_name: "person",
  first_name: "person",
  last_name: "person",
  address: "address",
  street_address: "address",
  date_of_birth: "date_of_birth",
};

export const DETECTOR_LABELS = ["person", "address", "date_of_birth"];

const DEFAULT_THRESHOLD = 0.5;

type DetectorEntity = {
  label: string;
  start: number;
  end: number;
  score: number;
};

function thresholds(): Record<ModelGroup, number> {
  const base = Number(process.env.STOA_PII_DETECTOR_THRESHOLD ?? DEFAULT_THRESHOLD);
  const result = Object.fromEntries(
    MODEL_GROUPS.map((g) => [g, Number.isFinite(base) ? base : DEFAULT_THRESHOLD]),
  ) as Record<ModelGroup, number>;
  for (const group of MODEL_GROUPS) {
    const own = Number(process.env[`STOA_PII_DETECTOR_THRESHOLD_${group.toUpperCase()}`]);
    if (Number.isFinite(own) && own > 0) {
      result[group] = own;
    }
  }
  return result;
}

/** Raw detector output, before thresholds. Exposed for evaluation. */
export async function fetchDetectorEntities(
  text: string,
  options: { url?: string; timeoutMs?: number; threshold?: number } = {},
): Promise<DetectorEntity[]> {
  const url = options.url ?? detectorUrl();
  if (!url || !text.trim()) {
    return [];
  }
  const response = await fetch(`${url}/detect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      labels: DETECTOR_LABELS,
      threshold: options.threshold ?? 0.3,
    }),
    signal: AbortSignal.timeout(
      options.timeoutMs ?? Number(process.env.STOA_PII_DETECTOR_TIMEOUT_MS ?? 5000),
    ),
  });
  if (!response.ok) {
    throw new Error(`Detector returned ${response.status}`);
  }
  const body = (await response.json()) as { entities?: DetectorEntity[] };
  return body.entities ?? [];
}

export function entitiesToSpans(
  entities: DetectorEntity[],
  minScore: Record<ModelGroup, number>,
): DetectedSpan[] {
  const spans: DetectedSpan[] = [];
  for (const entity of entities) {
    const group = LABEL_GROUPS[entity.label];
    if (group && entity.score >= minScore[group] && entity.end > entity.start) {
      spans.push({ start: entity.start, end: entity.end, group });
    }
  }
  return spans;
}

/** Patterns plus the language model detector when one is configured. */
export async function redactForUpstream(
  text: string,
  options: RedactOptions,
  detectorOptions: { timeoutMs?: number } = {},
) {
  if (!detectorEnabled()) {
    return redactPrompt(text, options);
  }
  let entities: DetectorEntity[];
  try {
    entities = await fetchDetectorEntities(text, detectorOptions);
  } catch (error) {
    if (process.env.STOA_PII_DETECTOR_OPTIONAL === "1") {
      console.error("[stoa] detector unavailable, using patterns only", error);
      return redactPrompt(text, options);
    }
    throw new PrivacyCheckUnavailableError(error);
  }
  return redactPrompt(text, {
    ...options,
    detected: entitiesToSpans(entities, thresholds()),
  });
}
