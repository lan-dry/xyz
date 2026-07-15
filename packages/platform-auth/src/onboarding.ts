import type pg from "pg";
import { auditConsoleEvent } from "./console-audit.js";
import { getOrganizationSlug } from "./agent-provisioning.js";

export class OnboardingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OnboardingError";
  }
}

export function slugifyOrganizationName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "organization";
}

export async function organizationNeedsOnboarding(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<boolean> {
  const row = await client.query<{ onboarding_completed_at: Date | null }>(
    `SELECT onboarding_completed_at FROM organization WHERE organization_id = $1 AND active`,
    [organizationId],
  );
  return row.rows[0] != null && row.rows[0].onboarding_completed_at == null;
}

/** Rebind agent DIDs and did_document service endpoints after org slug changes. */
export async function rebindOrganizationSlug(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  newSlug: string,
): Promise<void> {
  const agents = await client.query<{
    agent_id: string;
    did: string;4
  }>(
    `SELECT agent_id, did FROM agent WHERE organization_id = $1`,
    [organizationId],
  );

  for (const agent of agents.rows) {
    const newDid = `did:salanor:${newSlug}:${agent.agent_id}`;
    await client.query(
      `UPDATE agent SET did = $1, updated_at = now() WHERE agent_id = $2`,
      [newDid, agent.agent_id],
    );
    const docRow = await client.query<{ document_json: Record<string, unknown> }>(
      `SELECT document_json FROM did_document WHERE agent_id = $1`,
      [agent.agent_id],
    );
    const doc = docRow.rows[0]?.document_json;
    if (doc && typeof doc === "object") {
      const updated = {
        ...doc,
        id: newDid,
        controller: newDid,
        service: Array.isArray(doc.service)
          ? (doc.service as Record<string, unknown>[]).map((svc) => {
              if (svc?.type === "AegisWitness") {
                return {
                  ...svc,
                  serviceEndpoint: `/v1/public/orgs/${newSlug}/verify`,
                };
              }
              return svc;
            })
          : doc.service,
      };
      await client.query(
        `UPDATE did_document SET document_json = $1::jsonb, published_at = now() WHERE agent_id = $2`,
        [JSON.stringify(updated), agent.agent_id],
      );
    }
  }
}

export async function completeOrganizationOnboarding(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    organizationName: string;
    organizationSlug?: string;
  },
): Promise<{ organization_id: string; name: string; slug: string }> {
  const name = input.organizationName.trim();
  if (name.length < 2 || name.length > 120) {
    throw new OnboardingError("invalid_name", "Company name must be 2–120 characters.");
  }

  const pending = await organizationNeedsOnboarding(client, input.organizationId);
  if (!pending) {
    throw new OnboardingError("already_complete", "Organization onboarding is already complete.");
  }

  const slug = (input.organizationSlug?.trim() || slugifyOrganizationName(name))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  if (slug.length < 2) {
    throw new OnboardingError("invalid_slug", "Organization URL slug is too short.");
  }
  if (slug.startsWith("pending-")) {
    throw new OnboardingError("invalid_slug", "Choose a permanent organization slug.");
  }

  const taken = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1 AND organization_id <> $2`,
    [slug, input.organizationId],
  );
  if (taken.rows[0]) {
    throw new OnboardingError("slug_taken", "That organization URL is already in use. Try another.");
  }

  const oldSlug = await getOrganizationSlug(client, input.organizationId);

  await client.query(
    `UPDATE organization
     SET name = $1, slug = $2, onboarding_completed_at = now(), updated_at = now()
     WHERE organization_id = $3`,
    [name, slug, input.organizationId],
  );

  if (oldSlug && oldSlug !== slug) {
    await rebindOrganizationSlug(client, input.organizationId, slug);
  }

  await auditConsoleEvent(
    client,
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
    },
    {
      action: "organization.onboarding.completed",
      resourceType: "organization",
      resourceId: input.organizationId,
      metadata: { name, slug },
    },
  );

  return { organization_id: input.organizationId, name, slug };
}
