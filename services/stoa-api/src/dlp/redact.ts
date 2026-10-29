import {
  MODEL_PLACEHOLDERS,
  PROFILE_GROUPS,
  REDACTION_PATTERNS,
  type DlpProfile,
  type ModelGroup,
  type PatternGroup,
} from "./patterns.js";
import type { TenantCustomDlpPattern } from "../tenant/settings.js";
import {
  buildRedactionManifest,
  type ManifestGroup,
  type RedactionManifestEntry,
} from "./manifest.js";

export type RedactSpan = {
  start: number;
  end: number;
  value: string;
  token: string;
};

export type RedactResult = {
  /** Text safe to send upstream (placeholder tokens). */
  text: string;
  redactionCount: number;
  groupsHit: PatternGroup[];
  /** Placeholder → original for every placeholder used in this text. */
  vault: Record<string, string>;
  manifest: RedactionManifestEntry[];
  /** One entry per placeholder in this text, in order of first appearance. */
  items: RedactedItem[];
  /** Character offsets in the original input (for OCR / pixel redaction). */
  spans: RedactSpan[];
};

export type RedactedItem = {
  token: string;
  value: string;
  group: ManifestGroup;
};

export type RedactOptions = {
  profile?: DlpProfile;
  customTerms?: string[];
  customPatterns?: TenantCustomDlpPattern[];
  /**
   * Placeholder → original from earlier messages in the same conversation.
   * The same value keeps the same placeholder, and new values continue the numbering.
   */
  priorVault?: Record<string, string>;
  /** Spans found by the language model detector, as offsets into the input. */
  detected?: DetectedSpan[];
  /** @deprecated use profile */
  email?: boolean;
  phone?: boolean;
};

export type DetectedSpan = {
  start: number;
  end: number;
  group: ModelGroup;
};

type Span = {
  start: number;
  end: number;
  value: string;
  group: ManifestGroup;
  stem: string;
  score: number;
};

type SpanRule = {
  group: ManifestGroup;
  stem: string;
  priority: number;
  accept?: (match: string) => boolean;
  context?: RegExp;
  skipAmounts?: boolean;
};

const CUSTOM_PRIORITY = 110;
/** Below every pattern, so a pattern names the placeholder when both fire. */
const MODEL_PRIORITY = 70;
const EDGE_TRIM = /^[\s.,;:!?«»"'()[\]-]+|[\s.,;:!?«»"'()[\]-]+$/g;
const CONTEXT_BONUS = 50;
const CONTEXT_WINDOW = 40;
const CURRENCY_AFTER =
  /^\s*(?:F\s?CFA|XAF|XOF|RWF|FRW|EUR|USD|GBP|CHF|€|\$|£|francs?\b|dollars?\b|euros?\b)/i;
const CURRENCY_BEFORE = /(?:F\s?CFA|XAF|XOF|RWF|FRW|EUR|USD|GBP|CHF|€|\$|£)\s*$/i;

const PLACEHOLDER_RE = /^\[([A-Z][A-Z0-9_]*?)_(\d+)\]$/;

function resolveGroups(options: RedactOptions): Set<PatternGroup> {
  if (options.profile) {
    return new Set(PROFILE_GROUPS[options.profile]);
  }
  const groups = new Set<PatternGroup>();
  if (options.email !== false) {
    groups.add("email");
  }
  if (options.phone !== false) {
    groups.add("phone");
  }
  if (groups.size === 0) {
    return new Set(PROFILE_GROUPS.standard);
  }
  return groups;
}

function digitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

/** Admin tokens like "[REDACTED_CLIENT]" become the stem "CLIENT". */
export function placeholderStemFromToken(token: string): string {
  const stem = token
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .replace(/^REDACTED_?/, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return /^[A-Z]/.test(stem) ? stem.slice(0, 24) : "CUSTOM";
}

function normalizeForMatch(stem: string, value: string): string {
  if (["EMAIL", "TERM", "NAME", "ADDRESS"].includes(stem)) {
    return value.trim().toLowerCase();
  }
  if (["PHONE", "CARD", "ID", "ACCOUNT", "IBAN"].includes(stem)) {
    return value.replace(/[^\dA-Za-z+]/g, "").toUpperCase();
  }
  return value.trim();
}

function looksLikeAmount(input: string, start: number, end: number): boolean {
  return (
    CURRENCY_AFTER.test(input.slice(end, end + 8)) ||
    CURRENCY_BEFORE.test(input.slice(Math.max(0, start - 6), start))
  );
}

function collectSpans(input: string, re: RegExp, rule: SpanRule, out: Span[]) {
  const global = re.flags.includes("g") ? re : new RegExp(re.source, `${re.flags}g`);
  global.lastIndex = 0;
  for (const match of input.matchAll(global)) {
    const value = match[0];
    if (!value || match.index === undefined) {
      continue;
    }
    const start = match.index;
    const end = start + value.length;
    if (rule.accept && !rule.accept(value)) {
      continue;
    }
    if (rule.skipAmounts && looksLikeAmount(input, start, end)) {
      continue;
    }
    const before = input.slice(Math.max(0, start - CONTEXT_WINDOW), start);
    const score =
      rule.priority + (rule.context?.test(before) ? CONTEXT_BONUS : 0);
    out.push({ start, end, value, group: rule.group, stem: rule.stem, score });
  }
}

/**
 * Overlapping detections are merged so no fragment of a flagged value can slip
 * through; the most confident rule in the cluster names the placeholder.
 */
function mergeOverlapping(input: string, spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const span of sorted) {
    const current = merged[merged.length - 1];
    if (!current || span.start >= current.end) {
      merged.push({ ...span });
      continue;
    }
    const best =
      span.score > current.score ||
      (span.score === current.score && span.end - span.start > current.end - current.start)
        ? span
        : current;
    const end = Math.max(current.end, span.end);
    merged[merged.length - 1] = {
      ...best,
      start: current.start,
      end,
      value: input.slice(current.start, end),
    };
  }
  return merged;
}

export function redactPrompt(
  input: string,
  options: RedactOptions = { profile: "financial" },
): RedactResult {
  const active = resolveGroups(options);
  const candidates: Span[] = [];

  for (const pattern of REDACTION_PATTERNS) {
    if (!active.has(pattern.group)) {
      continue;
    }
    collectSpans(
      input,
      pattern.regex,
      {
        group: pattern.group,
        stem: pattern.placeholder,
        priority: pattern.priority,
        context: pattern.context,
        skipAmounts: pattern.skipAmounts,
        accept: (m) => {
          const digits = digitCount(m);
          return (
            (!pattern.minDigits || digits >= pattern.minDigits) &&
            (!pattern.maxDigits || digits <= pattern.maxDigits) &&
            (!pattern.validate || pattern.validate(m))
          );
        },
      },
      candidates,
    );
  }

  for (const term of options.customTerms ?? []) {
    const trimmed = term?.trim();
    if (!trimmed) {
      continue;
    }
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    collectSpans(
      input,
      new RegExp(`\\b${escaped}\\b`, "gi"),
      { group: "custom_term", stem: "TERM", priority: CUSTOM_PRIORITY },
      candidates,
    );
  }

  for (const custom of options.customPatterns ?? []) {
    if (!custom.enabled) {
      continue;
    }
    let re: RegExp;
    try {
      re = new RegExp(custom.regex, "gi");
    } catch {
      continue;
    }
    collectSpans(
      input,
      re,
      {
        group: "custom_pattern",
        stem: placeholderStemFromToken(custom.token),
        priority: CUSTOM_PRIORITY,
      },
      candidates,
    );
  }

  const detectedValues = new Map<string, ModelGroup>();
  for (const found of options.detected ?? []) {
    if (!active.has(found.group)) {
      continue;
    }
    const raw = input.slice(found.start, found.end);
    const value = raw.replace(EDGE_TRIM, "");
    if (value.length < 2) {
      continue;
    }
    const start = found.start + raw.indexOf(value);
    candidates.push({
      start,
      end: start + value.length,
      value,
      group: found.group,
      stem: MODEL_PLACEHOLDERS[found.group],
      score: MODEL_PRIORITY,
    });
    detectedValues.set(value, found.group);
  }
  // The model can flag a name once and miss its repeats.
  for (const [value, group] of detectedValues) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    collectSpans(
      input,
      new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu"),
      { group, stem: MODEL_PLACEHOLDERS[group], priority: MODEL_PRIORITY },
      candidates,
    );
  }

  const spans = mergeOverlapping(input, candidates);

  const prior = options.priorVault ?? {};
  const byValue = new Map<string, string>();
  const nextIndex = new Map<string, number>();
  for (const [token, original] of Object.entries(prior)) {
    const parsed = PLACEHOLDER_RE.exec(token);
    if (!parsed) {
      continue;
    }
    const [, stem, n] = parsed;
    byValue.set(`${stem}\u0000${normalizeForMatch(stem, original)}`, token);
    nextIndex.set(stem, Math.max(nextIndex.get(stem) ?? 0, Number(n)));
  }

  const vault: Record<string, string> = {};
  const groupCounts = new Map<ManifestGroup, number>();
  const groupsHit = new Set<PatternGroup>();
  const items: RedactedItem[] = [];
  const appliedSpans: RedactSpan[] = [];
  let text = "";
  let last = 0;

  for (const span of spans) {
    const key = `${span.stem}\u0000${normalizeForMatch(span.stem, span.value)}`;
    let token = byValue.get(key);
    if (!token) {
      const n = (nextIndex.get(span.stem) ?? 0) + 1;
      nextIndex.set(span.stem, n);
      token = `[${span.stem}_${n}]`;
      byValue.set(key, token);
    }
    if (!(token in vault)) {
      items.push({ token, value: span.value, group: span.group });
      vault[token] = prior[token] ?? span.value;
    }
    groupCounts.set(span.group, (groupCounts.get(span.group) ?? 0) + 1);
    if (span.group !== "custom_term" && span.group !== "custom_pattern") {
      groupsHit.add(span.group);
    }
    appliedSpans.push({
      start: span.start,
      end: span.end,
      value: span.value,
      token,
    });
    text += input.slice(last, span.start) + token;
    last = span.end;
  }
  text += input.slice(last);

  return {
    text,
    redactionCount: spans.length,
    groupsHit: [...groupsHit],
    vault,
    manifest: buildRedactionManifest(groupCounts),
    items,
    spans: appliedSpans,
  };
}

/** Block inline file payloads in text when attachments are disabled. */
export function containsEmbeddedPayload(input: string): boolean {
  return (
    /data:(?:image|application)\/[^;]+;base64,/i.test(input) ||
    /![^[]*\]\(data:/i.test(input)
  );
}
