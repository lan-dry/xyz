import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPolicy, type LoadedPolicy } from "@open-policy-agent/opa-wasm";
import { evaluateRules, type PolicyEvaluation, type PolicyRuleInput } from "./evaluate-rules.js";

const DEFAULT_WASM_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../policy/policy.wasm",
);

let defaultPolicy: LoadedPolicy | null = null;
let defaultPolicyLoad: Promise<LoadedPolicy> | null = null;

async function getDefaultPolicy(): Promise<LoadedPolicy> {
  if (defaultPolicy) {
    return defaultPolicy;
  }
  if (!defaultPolicyLoad) {
    defaultPolicyLoad = loadPolicy(readFileSync(DEFAULT_WASM_PATH)).then((p) => {
      defaultPolicy = p;
      return p;
    });
  }
  return defaultPolicyLoad;
}

export async function evaluateWithOpa(
  policyId: string,
  rules: PolicyRuleInput[],
  toolName: string,
  wasmBytes?: Buffer | null,
): Promise<PolicyEvaluation | null> {
  try {
    const policy = wasmBytes
      ? await loadPolicy(wasmBytes)
      : await getDefaultPolicy();

    const input = {
      tool_name: toolName,
      rules: rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
      })),
    };

    const resultSet = policy.evaluate(input) as { result?: string }[];
    const opaDecision = resultSet[0]?.result;
    if (
      opaDecision !== "allow" &&
      opaDecision !== "deny" &&
      opaDecision !== "allow_with_obligation"
    ) {
      return null;
    }

    const attributed = evaluateRules(policyId, rules, toolName);
    const decision =
      opaDecision === "allow_with_obligation" ||
      attributed.decision === "allow_with_obligation"
        ? "allow_with_obligation"
        : opaDecision === "deny" || attributed.decision === "deny"
          ? "deny"
          : "allow";
    return {
      ...attributed,
      decision,
      reason: `opa:${decision}${attributed.rule_id ? ` (${attributed.rule_id})` : ""}`,
    };
  } catch {
    return null;
  }
}
