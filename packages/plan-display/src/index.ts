/**
 * Public plan copy: marketing fields + limits live in Postgres plan_catalog (Platform Ops).
 * Feature bullets and CTAs stay here as stable defaults until moved to CMS.
 * Charges: Stripe Price ID on plan_catalog.
 */
export type PlanSlug = "free" | "team" | "enterprise";

export type PlanDisplayInfo = {
  slug: PlanSlug;
  name: string;
  tagline: string;
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

/** Row shape from plan_catalog (platform-auth). */
export type PlanCatalogMarketingRow = {
  plan_slug: string;
  display_name: string;
  events_per_month: number | null;
  max_ingest_keys: number;
  max_members: number;
  retention_days: number;
  list_price: string;
  list_price_detail: string;
  tagline: string;
  billing_note: string;
  marketing_highlighted: boolean;
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

export function formatEventsPerMonthLimit(value: number | null): string {
  if (value === null) return "Unlimited";
  return value.toLocaleString("en-US");
}

export function formatRetentionDays(days: number): string {
  if (days >= 365 * 6) return "Up to 7 years";
  if (days >= 365) return days === 365 ? "1 year" : `${Math.round(days / 365)} years`;
  return `${days} days`;
}

export function planListPrice(
  slug: string,
  row?: Pick<PlanCatalogMarketingRow, "list_price" | "list_price_detail"> | null,
): string | null {
  const listPrice = row?.list_price?.trim();
  const listPriceDetail = row?.list_price_detail?.trim();
  if (listPrice) {
    return listPriceDetail ? `${listPrice} ${listPriceDetail}`.trim() : listPrice;
  }
  const fallback = PLAN_DISPLAY[slug as PlanSlug];
  if (!fallback) return null;
  return fallback.listPriceDetail
    ? `${fallback.listPrice} ${fallback.listPriceDetail}`.trim()
    : fallback.listPrice;
}

/** Merge DB catalog row with static marketing defaults (Resend-style: price from Ops, copy from repo). */
export function buildPublicPlanFromCatalog(row: PlanCatalogMarketingRow): PlanDisplayInfo | null {
  const slug = row.plan_slug as PlanSlug;
  const defaults = PLAN_DISPLAY[slug];
  if (!defaults) return null;

  return {
    ...defaults,
    name: row.display_name?.trim() || defaults.name,
    tagline: row.tagline?.trim() || defaults.tagline,
    listPrice: row.list_price?.trim() || defaults.listPrice,
    listPriceDetail: row.list_price_detail?.trim() || defaults.listPriceDetail,
    billingNote: row.billing_note?.trim() || defaults.billingNote,
    highlighted: row.marketing_highlighted,
    limits: {
      eventsPerMonth: formatEventsPerMonthLimit(row.events_per_month),
      apiKeys: row.max_ingest_keys,
      members: row.max_members,
      retention: formatRetentionDays(row.retention_days),
    },
  };
}

export function buildPublicPlansFromCatalog(
  rows: PlanCatalogMarketingRow[],
): PlanDisplayInfo[] {
  return rows
    .map((row) => buildPublicPlanFromCatalog(row))
    .filter((p): p is PlanDisplayInfo => p !== null);
}
