import { NextRequest, NextResponse } from "next/server";
import type { ApsEvent } from "@salanor/aegis-ledger-sdk";

import { evaluatePolicy, parsePolicyRules } from "@/lib/aegis/policy";
import { appendConsoleAudit } from "@/lib/console/audit";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const POLICY_SMOKE_FIXTURE_EVENT: ApsEvent = {
  aps_version: "0.1",
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  recorded_at: "2026-05-16T12:00:00.000Z",
  tenant_id: "policy-smoke",
  actor: {
    id: "agent:rules-engine",
    type: "software_agent",
  },
  action: "decision.record",
  subject: {
    type: "workflow_step",
    id: "credit-approval",
  },
  context: {
    inputs: { amount_usd: 12000, credit_score: 710 },
    outcome: { decision: "approve", confidence: 0.92 },
  },
  signature: {
    alg: "local-placeholder",
    value: "placeholder:0000000000000000000000000000000000000000000000000000000000000000",
  },
  chain: {
    prev_event_hash: null,
    event_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  },
};

export async function GET() {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    const [activePolicy, recentPolicies] = await Promise.all([
      prisma.aegisPolicy.findFirst({
        where: {
          organizationId: scoped.activeOrgId,
          enabled: true,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      }),
      prisma.aegisPolicy.findMany({
        where: {
          organizationId: scoped.activeOrgId,
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        take: 10,
      }),
    ]);

    return NextResponse.json({
      activePolicy,
      recentPolicies,
    });
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "admin", async (scoped) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
    }

    const input = body as {
      name?: unknown;
      rules?: unknown;
      dryRun?: unknown;
      runSmokeTest?: unknown;
    };
    const name = typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Policy";
    const rules = input.rules;
    const dryRun = input.dryRun === true;
    // Dry-run validation should check schema only unless explicitly requested.
    const runSmokeTest = dryRun ? input.runSmokeTest === true : input.runSmokeTest !== false;
    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      return NextResponse.json(
        { error: "Policy rules must be a JSON object", details: ["rules must be a JSON object"] },
        { status: 400 },
      );
    }

    const parsedRules = parsePolicyRules(rules);
    if (!parsedRules) {
      return NextResponse.json(
        {
          error: "Policy rules are invalid",
          valid: false,
          details: ["rules must match policy schema v1"],
        },
        { status: 422 },
      );
    }

    if (runSmokeTest) {
      const smoke = evaluatePolicy(POLICY_SMOKE_FIXTURE_EVENT, parsedRules);
      if (!smoke.allow) {
        return NextResponse.json(
          {
            error: "Policy smoke test failed against fixture event",
            valid: false,
            details: smoke.violations,
          },
          { status: 422 },
        );
      }
    }

    if (dryRun) {
      return NextResponse.json({ valid: true, details: [] });
    }

    const existingActive = await prisma.aegisPolicy.findFirst({
      where: {
        organizationId: scoped.activeOrgId,
        enabled: true,
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        version: true,
      },
    });
    const nextVersion = (existingActive?.version ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      await tx.aegisPolicy.updateMany({
        where: {
          organizationId: scoped.activeOrgId,
          enabled: true,
        },
        data: { enabled: false },
      });
      return tx.aegisPolicy.create({
        data: {
          organizationId: scoped.activeOrgId,
          name,
          version: nextVersion,
          rules,
          enabled: true,
        },
      });
    });

    await appendConsoleAudit({
      organizationId: scoped.activeOrgId,
      actorIdentityId: scoped.identityLinkId,
      action: existingActive ? "policy_updated" : "policy_created",
      targetType: "aegis_policy",
      targetId: created.id,
      metadata: {
        version: created.version,
      },
    });

    return NextResponse.json(
      {
        policy: created,
      },
      { status: 200 },
    );
  });
}
