import type { Context } from "hono";
import { getPublicPlanOffers } from "@salanor/platform-auth";

import { getPool } from "../db/pool.js";

/** Public pricing catalog — no auth. Marketing site revalidates every 60s. */
export async function handlePublicPlans(c: Context) {
  if (!process.env.DATABASE_URL) {
    return c.json({ error: "Service unavailable" }, 503);
  }

  const plans = await getPublicPlanOffers(getPool());

  c.header("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  return c.json({
    plans,
    source: "plan_catalog",
    updated_at: new Date().toISOString(),
  });
}
