import {
  PLAN_DISPLAY_LIST,
  type PlanDisplayInfo,
  type PlanSlug,
} from "@salanor/plan-display";

export type { PlanSlug };

export type PricingPlan = PlanDisplayInfo & {
  priceLabel: string;
  priceDetail: string;
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

/** Marketing cards — sourced from @salanor/plan-display (same as Platform Ops list price). */
export const AEGIS_PLANS: PricingPlan[] = PLAN_DISPLAY_LIST.map((p) => ({
  ...p,
  priceLabel: p.listPrice,
  priceDetail: p.listPriceDetail,
}));

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
