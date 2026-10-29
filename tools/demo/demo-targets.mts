import {
  DEFAULT_PILOT_ORG_SLUG,
  resolveOrganizationId,
} from "./resolve-org-id.mts";

export const PILOT_AGENT_ID = "agent-refund-operations";
export const PILOT_KEY_ID = "key-refund-operations";
export { DEFAULT_PILOT_ORG_SLUG };

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
    DEFAULT_PILOT_ORG_SLUG;
  const organizationId = await resolveOrganizationId(organizationSlug);
  return {
    organizationId,
    organizationSlug,
    agentId: process.env.DEMO_AGENT_ID?.trim() || PILOT_AGENT_ID,
    keyId: process.env.DEMO_KEY_ID?.trim() || PILOT_KEY_ID,
  };
}
