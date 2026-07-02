import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, rollups } from "@/db/schema";
import { HQ_COMPOSITE_MIN } from "@/lib/scoring/constants";

const DIMENSIONS = [
  ["campaign", leads.campaign],
  ["ad_set", leads.adSet],
  ["creative", leads.creative],
  ["platform", leads.platform],
  ["landing_page", leads.landingPage],
] as const;

/**
 * Materialize daily-grain additive rollups for all five dimensions.
 * Idempotent: wipes and rebuilds the dataset's rollups. Ratios (CPL,
 * qualified CPL, ROAS) are always derived at query time from these sums.
 */
export async function materializeRollups(datasetId: string): Promise<void> {
  await db.delete(rollups).where(eq(rollups.datasetId, datasetId));

  for (const [dimension, column] of DIMENSIONS) {
    await db.execute(sql`
      INSERT INTO rollups (
        dataset_id, dimension, dimension_value, day,
        lead_count, hq_lead_count, suppress_count,
        spend_cents, revenue_cents, hq_revenue_cents, conversions, score_sum
      )
      SELECT
        ${datasetId}::uuid,
        ${dimension}::rollup_dimension,
        ${column},
        (created_at AT TIME ZONE 'UTC')::date,
        count(*),
        count(*) FILTER (
          WHERE composite_score >= ${HQ_COMPOSITE_MIN} AND segment != 'suppress'
        ),
        count(*) FILTER (WHERE segment = 'suppress'),
        coalesce(sum(cost_cents), 0),
        coalesce(sum(revenue_cents), 0),
        coalesce(sum(revenue_cents) FILTER (
          WHERE composite_score >= ${HQ_COMPOSITE_MIN} AND segment != 'suppress'
        ), 0),
        count(*) FILTER (WHERE converted),
        coalesce(sum(composite_score), 0)
      FROM leads
      WHERE dataset_id = ${datasetId}::uuid AND ${column} IS NOT NULL
      GROUP BY 3, 4
    `);
  }
}
