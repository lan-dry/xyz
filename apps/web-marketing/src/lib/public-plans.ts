import {
  PLAN_DISPLAY_LIST,
  type PlanDisplayInfo,
} from "@salanor/plan-display";

const ID_API =
  process.env.SALANOR_ID_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8091";

type PublicPlansResponse = {
  plans: PlanDisplayInfo[];
};

/** Fetch live catalog from Salanor ID (Ops-editable). Falls back to repo defaults offline. */
export async function fetchPublicPlans(): Promise<{
  plans: PlanDisplayInfo[];
  live: boolean;
}> {
  try {
    const res = await fetch(`${ID_API}/v1/id/public/plans`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { plans: PLAN_DISPLAY_LIST, live: false };
    }
    const data = (await res.json()) as PublicPlansResponse;
    if (!Array.isArray(data.plans) || data.plans.length === 0) {
      return { plans: PLAN_DISPLAY_LIST, live: false };
    }
    return { plans: data.plans, live: true };
  } catch {
    return { plans: PLAN_DISPLAY_LIST, live: false };
  }
}

export function toPricingPlan(plan: PlanDisplayInfo) {
  return {
    ...plan,
    priceLabel: plan.listPrice,
    priceDetail: plan.listPriceDetail,
  };
}
