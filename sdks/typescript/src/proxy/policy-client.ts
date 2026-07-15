import type { PolicyDecision } from "../types.js";

export type PolicyEvaluateResult = {
  decision: PolicyDecision;
  policy_id: string;
  rule_id: string | null;
  reason: string;
  engine?: string;
};

export async function evaluatePolicyViaApi(
  apiBaseUrl: string,
  ingestApiKey: string,
  input: {
    organization_id: string;
    agent_id: string;
    tool_name: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PolicyEvaluateResult> {
  const url = new URL("/v1/aegis/policy/evaluate", apiBaseUrl);
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ingestApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const body = (await res.json().catch(() => ({}))) as PolicyEvaluateResult & {
    error?: string;
  };

  if (!res.ok) {
    throw new Error(
      `Policy evaluate failed (${res.status}): ${body.error ?? JSON.stringify(body)}`,
    );
  }

  if (
    body.decision !== "allow" &&
    body.decision !== "deny" &&
    body.decision !== "allow_with_obligation"
  ) {
    throw new Error("Invalid policy decision from API");
  }

  return body;
}
