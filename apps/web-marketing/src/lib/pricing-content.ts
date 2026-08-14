/**
 * Published Aegis pricing. Keep in sync with plan_catalog (migration 028) and Platform Ops → Plans.
 */
export type PlanSlug = "free" | "team" | "enterprise";

export type PricingPlan = {
  slug: PlanSlug;
  name: string;
  tagline: string;
  priceLabel: string;
  priceDetail: string;
  billingNote: string;
  cta: { label: string; href: string; external?: boolean };
  highlighted?: boolean;
  limits: {
    eventsPerMonth: string;
    apiKeys: number;
    members: number;
    retention: string;
  };
  includes: string[];
  notIncluded?: string[];
};

export const PRICING_FAQ = [
  {
    q: "What counts as an event?",
    a: "Each signed APS-1 record ingested into your organization ledger: trace starts, policy checks, tool calls, approvals, and completions. One governed workflow run is typically 5–15 events.",
  },
  {
    q: "Can we start on Free and upgrade later?",
    a: "Yes. Free is for evaluation and pilots. Upgrade to Team via self-serve checkout when Stripe is configured, or contact sales for invoice billing on Team or Enterprise.",
  },
  {
    q: "Do you charge per seat?",
    a: "No. Pricing is per organization with member and event limits. Enterprise adds SSO and custom contracts, not a per-seat tax on every developer.",
  },
  {
    q: "Are compliance exports a certification?",
    a: "No. Exports map your Aegis evidence to control frameworks (SOC 2 themes, EU AI Act articles). They support your audit program; they are not Salanor's own SOC 2 certificate.",
  },
  {
    q: "What if we exceed Team event limits?",
    a: "Ingest returns HTTP 402 until the next calendar month or you upgrade. Enterprise includes fair-use unlimited events with custom overrides for high-volume fleets.",
  },
] as const;

/** Early GTM: priced above your infra stack (Railway, Resend) but below legacy GRC per-seat tools. Adjust in this file + Stripe + Ops UI. */
export const AEGIS_PLANS: PricingPlan[] = [
  {
    slug: "free",
    name: "Free",
    tagline: "Evaluate and demo",
    priceLabel: "$0",
    priceDetail: "forever",
    billingNote: "Self-serve signup · no card",
    cta: {
      label: "Start free",
      href: "https://app.salanor.com/signup",
      external: true,
    },
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
  },
  {
    slug: "team",
    name: "Team",
    tagline: "Production governance",
    priceLabel: "$299",
    priceDetail: "/ month",
    billingNote: "Billed monthly · annual discount on request",
    cta: {
      label: "Upgrade in Console",
      href: "https://app.salanor.com/aegis/settings/billing",
      external: true,
    },
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
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    tagline: "Regulated scale",
    priceLabel: "Custom",
    priceDetail: "from ~$999 / mo",
    billingNote: "Annual contract · invoice or PO",
    cta: {
      label: "Contact sales",
      href: "/contact",
    },
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
  },
];

export const PRICING_COMPARISON_ROWS: Array<{
  feature: string;
  free: string | boolean;
  team: string | boolean;
  enterprise: string | boolean;
}> = [
  { feature: "Signed events / month", free: "10,000", team: "100,000", enterprise: "Unlimited" },
  { feature: "API keys", free: "3", team: "15", enterprise: "100" },
  { feature: "Members", free: "5", team: "25", enterprise: "500" },
  { feature: "Event retention", free: "90 days", team: "1 year", enterprise: "Up to 7 years" },
  { feature: "Policy + approvals", free: true, team: true, enterprise: true },
  { feature: "Trace replay + verify", free: true, team: true, enterprise: true },
  { feature: "Compliance exports", free: "2 / month", team: "Unlimited", enterprise: "Unlimited + custom" },
  { feature: "Scheduled exports", free: false, team: true, enterprise: true },
  { feature: "OTel / SIEM export", free: false, team: true, enterprise: true },
  { feature: "SSO / SAML", free: false, team: false, enterprise: true },
  { feature: "Support", free: "Community", team: "Priority email", enterprise: "Dedicated + SLA" },
  { feature: "Billing", free: "Free", team: "Stripe self-serve", enterprise: "Invoice" },
];
