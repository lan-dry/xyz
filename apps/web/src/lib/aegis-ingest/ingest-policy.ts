import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

import { prisma } from "@/lib/prisma";

import { evaluatePolicy, parsePolicyRules } from "./policy";

type IngestPolicyAllow = {
  ok: true;
};

type IngestPolicyDeny = {
  ok: false;
  status: 422;
  message: string;
  details: string[];
  policy: {
    id: string;
    name: string;
    version: number;
  };
};

export type IngestPolicyDecision = IngestPolicyAllow | IngestPolicyDeny;

export type ReplayPolicyDecision = {
  allow: boolean;
  violations: string[];
  policy: {
    id: string;
    name: string;
    version: number;
  } | null;
};

function logPolicyDecision(input: {
  traceId: string;
  eventId: string;
  surface: "ingest" | "replay";
  policyId?: string;
  policyName?: string;
  policyVersion?: number;
  allow: boolean;
  violations: string[];
}) {
  console.log(
    JSON.stringify({
      level: input.allow ? "info" : "warn",
      trace_id: input.traceId,
      event_id: input.eventId,
      msg: input.allow ? "policy_allow" : "policy_deny",
      surface: input.surface,
      policy_id: input.policyId,
      policy_name: input.policyName,
      policy_version: input.policyVersion,
      violations: input.violations,
    }),
  );
}

async function loadActivePolicy(organizationId: string) {
  return prisma.aegisPolicy.findFirst({
    where: {
      organizationId,
      enabled: true,
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      version: true,
      rules: true,
    },
  });
}

async function evaluatePolicyForSurface(params: {
  organizationId: string;
  traceId: string;
  event: ApsEvent;
  surface: "ingest" | "replay";
}): Promise<ReplayPolicyDecision> {
  const policy = await loadActivePolicy(params.organizationId);
  if (!policy) {
    return {
      allow: true,
      violations: [],
      policy: null,
    };
  }

  const writeLog = async (allow: boolean, violations: string[]) => {
    await prisma.policyEvaluationLog.create({
      data: {
        organizationId: params.organizationId,
        policyId: policy.id,
        traceId: params.traceId,
        eventId: params.event.event_id,
        decision: allow ? "allow" : "deny",
        // No metadata column on this table yet; encode surface into violations payload.
        violations: {
          surface: params.surface,
          violations,
        },
      },
    });
    logPolicyDecision({
      traceId: params.traceId,
      eventId: params.event.event_id,
      surface: params.surface,
      policyId: policy.id,
      policyName: policy.name,
      policyVersion: policy.version,
      allow,
      violations,
    });
  };

  const rules = parsePolicyRules(policy.rules);
  if (!rules) {
    const violations = ["policy_config_invalid: unsupported rules schema"];
    await writeLog(false, violations);
    return {
      allow: false,
      violations,
      policy: { id: policy.id, name: policy.name, version: policy.version },
    };
  }

  const evaluation = evaluatePolicy(params.event, rules);
  await writeLog(evaluation.allow, evaluation.violations);
  return {
    allow: evaluation.allow,
    violations: evaluation.violations,
    policy: { id: policy.id, name: policy.name, version: policy.version },
  };
}

export async function enforceIngestPolicy(params: {
  organizationId: string;
  traceId: string;
  event: ApsEvent;
}): Promise<IngestPolicyDecision> {
  const evaluation = await evaluatePolicyForSurface({
    organizationId: params.organizationId,
    traceId: params.traceId,
    event: params.event,
    surface: "ingest",
  });
  if (!evaluation.policy) {
    return { ok: true };
  }
  if (!evaluation.allow) {
    return {
      ok: false,
      status: 422,
      message: "Policy denied event.",
      details: evaluation.violations,
      policy: evaluation.policy,
    };
  }
  return { ok: true };
}

export async function evaluatePolicyForReplay(params: {
  organizationId: string;
  traceId: string;
  event: ApsEvent;
}): Promise<ReplayPolicyDecision> {
  return evaluatePolicyForSurface({
    organizationId: params.organizationId,
    traceId: params.traceId,
    event: params.event,
    surface: "replay",
  });
}
