/**
 * Reject unknown rule condition keys and obligation types at save/activate (B1).
 * Unrecognised content must never silently match everything or silently downgrade.
 */

export type RuleValidationIssue = {
  path: string;
  code: string;
  message: string;
};

/** Condition keys the bank / APS engines understand. */
const KNOWN_CONDITION_KEYS = new Set([
  "expr",
  "when",
  "rule_type",
  "obligations",
  "hard_stop",
  "amount_gte",
  "amount_gt",
  "amount_lte",
  "amount_lt",
  "amount_eq",
  "max_amount_usd",
  "min_amount_usd",
  "limit_source",
  "segment_limits",
  "window_hours",
  "blocked_beneficiaries",
  "expected_beneficiary_field",
  "on_lookup_fail",
  "tool",
]);

const KNOWN_OBLIGATION_KINDS = new Set([
  "human_approval",
  "approval",
  "require_approval",
  "human",
  "ask_person",
  "callback_verify",
  "other",
]);

function obligationKind(o: unknown): string | null {
  if (o == null) return null;
  if (typeof o === "string") return o.toLowerCase();
  if (typeof o === "object" && !Array.isArray(o)) {
    const rec = o as Record<string, unknown>;
    const kind = rec.kind ?? rec.type ?? rec.obligation;
    return typeof kind === "string" ? kind.toLowerCase() : null;
  }
  return null;
}

function validateObligations(
  obligations: unknown,
  path: string,
  issues: RuleValidationIssue[],
): void {
  if (obligations == null) return;
  const list = Array.isArray(obligations) ? obligations : [obligations];
  list.forEach((item, i) => {
    const kind = obligationKind(item);
    if (!kind) {
      issues.push({
        path: `${path}[${i}]`,
        code: "obligation_kind_missing",
        message: "Obligation must include kind or type",
      });
      return;
    }
    if (!KNOWN_OBLIGATION_KINDS.has(kind)) {
      issues.push({
        path: `${path}[${i}]`,
        code: "unknown_obligation_kind",
        message: `Unrecognised obligation type "${kind}". Known: ${[...KNOWN_OBLIGATION_KINDS].join(", ")}`,
      });
    }
  });
}

export function validatePolicyRule(
  rule: {
    rule_id?: string;
    tool_pattern?: string;
    decision?: string;
    priority?: number;
    conditions?: unknown;
    obligations?: unknown;
  },
  index = 0,
): RuleValidationIssue[] {
  const issues: RuleValidationIssue[] = [];
  const base = `rules[${index}]`;
  const id = rule.rule_id ?? `index_${index}`;

  if (!rule.tool_pattern || !String(rule.tool_pattern).trim()) {
    issues.push({
      path: `${base}.tool_pattern`,
      code: "tool_pattern_required",
      message: `Rule ${id}: tool_pattern is required`,
    });
  }

  const decision = String(rule.decision ?? "").toLowerCase();
  if (!["allow", "deny", "allow_with_obligation"].includes(decision)) {
    issues.push({
      path: `${base}.decision`,
      code: "unknown_decision",
      message: `Rule ${id}: decision must be allow, deny, or allow_with_obligation`,
    });
  }

  if (rule.conditions != null) {
    if (typeof rule.conditions !== "object" || Array.isArray(rule.conditions)) {
      issues.push({
        path: `${base}.conditions`,
        code: "conditions_object",
        message: `Rule ${id}: conditions must be a JSON object`,
      });
    } else {
      const cond = rule.conditions as Record<string, unknown>;
      for (const key of Object.keys(cond)) {
        if (!KNOWN_CONDITION_KEYS.has(key)) {
          issues.push({
            path: `${base}.conditions.${key}`,
            code: "unknown_condition_key",
            message: `Rule ${id}: unrecognised condition key "${key}". Known keys: ${[...KNOWN_CONDITION_KEYS].join(", ")}`,
          });
        }
      }
      if ("obligations" in cond) {
        validateObligations(cond.obligations, `${base}.conditions.obligations`, issues);
      }
    }
  }

  if (rule.obligations != null) {
    validateObligations(rule.obligations, `${base}.obligations`, issues);
  }

  return issues;
}

export function validatePolicyRules(
  rules: Array<{
    rule_id?: string;
    tool_pattern?: string;
    decision?: string;
    priority?: number;
    conditions?: unknown;
    obligations?: unknown;
  }>,
): RuleValidationIssue[] {
  return rules.flatMap((r, i) => validatePolicyRule(r, i));
}

export class PolicyRuleValidationError extends Error {
  readonly issues: RuleValidationIssue[];
  constructor(issues: RuleValidationIssue[]) {
    super(
      issues.map((i) => i.message).join("; ") || "Invalid policy rules",
    );
    this.name = "PolicyRuleValidationError";
    this.issues = issues;
  }
}
