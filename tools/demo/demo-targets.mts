/** Defaults match `tools/seed/dev.sql` (dev-org). Override via `.env` for live org testing. */
export const DEV_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
export const DEV_ORGANIZATION_SLUG = "dev-org";
export const DEV_AGENT_ID = "agent-dev-01";
export const DEV_KEY_ID = "key-dev-01";

export type DemoTargets = {
  organizationId: string;
  organizationSlug: string;
  agentId: string;
  keyId: string;
};

export function getDemoTargets(): DemoTargets {
  return {
    organizationId:
      process.env.DEMO_ORGANIZATION_ID?.trim() || DEV_ORGANIZATION_ID,
    organizationSlug:
      process.env.DEMO_ORGANIZATION_SLUG?.trim() || DEV_ORGANIZATION_SLUG,
    agentId: process.env.DEMO_AGENT_ID?.trim() || DEV_AGENT_ID,
    keyId: process.env.DEMO_KEY_ID?.trim() || DEV_KEY_ID,
  };
}
