import type pg from "pg";
import { auditConsoleEvent } from "./console-audit.js";
import { getOrganizationSlug } from "./agent-provisioning.js";
import { rebindOrganizationSlug, slugifyOrganizationName } from "./onboarding.js";

export class OrganizationProfileError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OrganizationProfileError";
  }
}

/**
 * Update display name and/or URL slug after onboarding (admin only).
 * Slug changes rebind agent DIDs — same pattern as Stripe/Slack workspace URL changes.
 */
export async function updateOrganizationProfile(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    membershipId: string;
    name?: string;
    slug?: string;
  },
): Promise<{ organization_id: string; name: string; slug: string; slug_changed: boolean }> {
  const nameInput = input.name?.trim();
  const slugInput = input.slug?.trim();

  if (!nameInput && !slugInput) {
    throw new OrganizationProfileError(
      "nothing_to_update",
      "Provide organization_name and/or organization_slug.",
    );
  }

  const row = await client.query<{
    name: string;
    slug: string;
    onboarding_completed_at: Date | null;
  }>(
    `SELECT name, slug, onboarding_completed_at FROM organization
     WHERE organization_id = $1 AND active`,
    [input.organizationId],
  );
  const org = row.rows[0];
  if (!org) {
    throw new OrganizationProfileError("not_found", "Organization not found.");
  }
  if (!org.onboarding_completed_at) {
    throw new OrganizationProfileError(
      "onboarding_incomplete",
      "Finish onboarding before changing organization settings.",
    );
  }

  const name = nameInput ?? org.name;
  if (name.length < 2 || name.length > 120) {
    throw new OrganizationProfileError("invalid_name", "Company name must be 2–120 characters.");
  }

  const slug = (slugInput || org.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (slug.length < 2) {
    throw new OrganizationProfileError("invalid_slug", "Organization URL slug is too short.");
  }
  if (slug.startsWith("pending-")) {
    throw new OrganizationProfileError("invalid_slug", "Choose a permanent organization slug.");
  }

  const taken = await client.query<{ organization_id: string }>(
    `SELECT organization_id FROM organization WHERE slug = $1 AND organization_id <> $2`,
    [slug, input.organizationId],
  );
  if (taken.rows[0]) {
    throw new OrganizationProfileError("slug_taken", "That organization URL is already in use.");
  }

  const oldSlug = await getOrganizationSlug(client, input.organizationId);
  const slugChanged = Boolean(oldSlug && oldSlug !== slug);

  await client.query(
    `UPDATE organization SET name = $1, slug = $2, updated_at = now() WHERE organization_id = $3`,
    [name, slug, input.organizationId],
  );

  if (slugChanged && oldSlug) {
    await rebindOrganizationSlug(client, input.organizationId, slug);
  }

  await auditConsoleEvent(
    client,
    {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
    },
    {
      action: "organization.profile.updated",
      resourceType: "organization",
      resourceId: input.organizationId,
      metadata: {
        name,
        slug,
        slug_changed: slugChanged,
        previous_slug: slugChanged ? oldSlug : undefined,
      },
    },
  );

  return {
    organization_id: input.organizationId,
    name,
    slug,
    slug_changed: slugChanged,
  };
}

export { slugifyOrganizationName };
