import { DEFAULT_PLATFORM_ORG_SLUG, resolveOrganizationId } from "./resolve-org-id.mts";

export const DEV_AGENT_ID = "agent-dev-01";
export const DEV_KEY_ID = "key-dev-01";

export type DemoTargets = {
  organizationId: string;
  organizationSlug: string;
  agentId: string;
  keyId: string;
};

export async function getDemoTargets(): Promise<DemoTargets> {
  const organizationSlug =
    process.env.DEMO_ORGANIZATION_SLUG?.trim() ||
    process.env.PILOT_ORGANIZATION_SLUG?.trim() ||
    DEFAULT_PLATFORM_ORG_SLUG;
  const organizationId = await resolveOrganizationId(organizationSlug);
  return {
    organizationId,
    organizationSlug,
    agentId: process.env.DEMO_AGENT_ID?.trim() || DEV_AGENT_ID,
    keyId: process.env.DEMO_KEY_ID?.trim() || DEV_KEY_ID,
  };
}
