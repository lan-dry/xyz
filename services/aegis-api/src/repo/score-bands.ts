import { randomUUID } from "node:crypto";
import type pg from "pg";

export type ScoreBandRow = {
  band_id: string;
  organization_id: string;
  environment: string;
  name: string;
  min_score: number;
  max_score: number;
  decision: "allow" | "allow_with_obligation" | "deny";
  require_four_eyes: boolean;
  sort_order: number;
};

export async function listScoreBands(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<ScoreBandRow[]> {
  const result = await client.query(
    `SELECT band_id, organization_id, environment, name,
            min_score::float8 AS min_score, max_score::float8 AS max_score,
            decision, require_four_eyes, sort_order
     FROM score_band
     WHERE organization_id = $1 AND environment = $2
     ORDER BY sort_order ASC, min_score ASC`,
    [organizationId, environment],
  );
  return result.rows as ScoreBandRow[];
}

export async function ensureDefaultScoreBands(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  environment: "production" | "sandbox" = "production",
): Promise<ScoreBandRow[]> {
  const existing = await listScoreBands(client, organizationId, environment);
  if (existing.length > 0) return existing;

  const defaults: Array<{
    name: string;
    min: number;
    max: number;
    decision: ScoreBandRow["decision"];
    fourEyes: boolean;
    order: number;
  }> = [
    { name: "Low", min: 0, max: 39, decision: "allow", fourEyes: false, order: 1 },
    {
      name: "Elevated",
      min: 40,
      max: 79,
      decision: "allow_with_obligation",
      fourEyes: false,
      order: 2,
    },
    {
      name: "Critical",
      min: 80,
      max: 100,
      decision: "deny",
      fourEyes: true,
      order: 3,
    },
  ];

  for (const d of defaults) {
    await client.query(
      `INSERT INTO score_band (
         band_id, organization_id, environment, name, min_score, max_score,
         decision, require_four_eyes, sort_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        `band_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        organizationId,
        environment,
        d.name,
        d.min,
        d.max,
        d.decision,
        d.fourEyes,
        d.order,
      ],
    );
  }
  return listScoreBands(client, organizationId, environment);
}

export function matchScoreBand(
  bands: ScoreBandRow[],
  score: number,
): ScoreBandRow | null {
  return (
    bands.find((b) => score >= Number(b.min_score) && score <= Number(b.max_score)) ??
    null
  );
}
