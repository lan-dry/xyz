/**
 * Canonical public plan copy and list prices.
 * Limits: Postgres plan_catalog (Platform Ops). Charges: Stripe Price ID.
 */
export type PlanSlug = "free" | "team" | "enterprise";

export type PlanDisplayInfo = {
  slug: PlanSlug;
  name: string;
  tagline: string;
  /** Shown on marketing and Ops (read-only). */
  listPrice: string;
  listPriceDetail: string;
  billingNote: string;
  highlighted?: boolean;
  limits: {
    eventsPerMonth: string;
    apiKeys: number;
    members: number;
    retention: string;
  };
  includes: string[];
  notIncluded?: string[];
  cta: { label: string; href: string; external?: boolean };
};

export const PLAN_DISPLAY: Record<PlanSlug, PlanDisplayInfo> = {
  free: {
    slug: "free",
    name: "Free",
    tagline: "Evaluate and demo",
    listPrice: "$0",
    listPriceDetail: "forever",
    billingNote: "Self-serve signup · no card",
    limits: {
      eventsPerMonth: "10,000",
      apiKeys: 3,
      members: 5,
      retention: "90 days",
    },
    includes: [
      "Signed APS-1 ingest and hash-chained ledger",
      "Policy engine with human approvals",
      "Trace replay and cryptographic verify",
      "Merkle witness and transparency proofs",
      "n8n Workflow Bridge and SDKs (TS, Python, Go)",
      "Up to 2 compliance export bundles per month",
      "Community support",
    ],
    notIncluded: [
      "Scheduled compliance exports",
      "OTel / SIEM streaming export",
      "SSO / SAML",
    ],
    cta: {
      label: "Start free",
      href: "https://app.salanor.com/signup",
      external: true,
    },
  },
  team: {
    slug: "team",
    name: "Team",
    tagline: "Production governance",
    listPrice: "$299",
    listPriceDetail: "/ month",
    billingNote: "Billed monthly · annual discount on request",
    highlighted: true,
    limits: {
      eventsPerMonth: "100,000",
      apiKeys: 15,
      members: 25,
      retention: "1 year",
    },
    includes: [
      "Everything in Free",
      "100,000 events per month",
      "Unlimited on-demand compliance exports",
      "Scheduled monthly export jobs",
      "OTel export to Splunk, Datadog, Sentinel",
      "Approval notifications (email, Slack, PagerDuty, SMS)",
      "Priority email support",
    ],
    cta: {
      label: "Upgrade in Console",
      href: "https://app.salanor.com/aegis/settings/billing",
      external: true,
    },
  },
  enterprise: {
    slug: "enterprise",
    name: "Enterprise",
    tagline: "Regulated scale",
    listPrice: "Custom",
    listPriceDetail: "from ~$999 / mo",
    billingNote: "Annual contract · invoice or PO",
    limits: {
      eventsPerMonth: "Unlimited",
      apiKeys: 100,
      members: 500,
      retention: "Up to 7 years",
    },
    includes: [
      "Everything in Team",
      "Fair-use unlimited events",
      "SSO / SAML (WorkOS) and JIT provisioning",
      "Custom plan overrides and retention",
      "Dedicated support and SLA options",
      "Security review, DPA, and procurement pack",
      "FedRAMP and private-cloud path (roadmap)",
    ],
    cta: {
      label: "Contact sales",
      href: "/contact",
    },
  },
};

export const PLAN_DISPLAY_LIST: PlanDisplayInfo[] = [
  PLAN_DISPLAY.free,
  PLAN_DISPLAY.team,
  PLAN_DISPLAY.enterprise,
];

export function planListPrice(slug: string): string | null {
  const row = PLAN_DISPLAY[slug as PlanSlug];
  if (!row) return null;
  return row.listPriceDetail
    ? `${row.listPrice} ${row.listPriceDetail}`.trim()
    : row.listPrice;
}
