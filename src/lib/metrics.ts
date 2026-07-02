import { qualifiedCplCents } from "@/lib/scoring/constants";

/** Additive sums straight from rollups (or aggregated over them). */
export interface RollupTotals {
  leadCount: number;
  hqLeadCount: number;
  suppressCount: number;
  spendCents: number;
  revenueCents: number;
  hqRevenueCents: number;
  conversions: number;
  scoreSum: number;
}

export interface DerivedMetrics {
  rawCplCents: number | null;
  qualifiedCplCents: number | null;
  hqRate: number;
  suppressRate: number;
  avgScore: number | null;
  revenuePerLeadCents: number;
  /** Total revenue ÷ total spend. */
  roas: number | null;
  /** HQ-lead revenue ÷ total spend — revenue you can trust per ad dollar. */
  qualityAdjustedRoas: number | null;
  conversionRate: number;
}

export function deriveMetrics(t: RollupTotals): DerivedMetrics {
  return {
    rawCplCents: t.leadCount > 0 ? Math.round(t.spendCents / t.leadCount) : null,
    qualifiedCplCents: qualifiedCplCents(t.spendCents, t.hqLeadCount),
    hqRate: t.leadCount > 0 ? t.hqLeadCount / t.leadCount : 0,
    suppressRate: t.leadCount > 0 ? t.suppressCount / t.leadCount : 0,
    avgScore: t.leadCount > 0 ? Math.round(t.scoreSum / t.leadCount) : null,
    revenuePerLeadCents:
      t.leadCount > 0 ? Math.round(t.revenueCents / t.leadCount) : 0,
    roas: t.spendCents > 0 ? t.revenueCents / t.spendCents : null,
    qualityAdjustedRoas:
      t.spendCents > 0 ? t.hqRevenueCents / t.spendCents : null,
    conversionRate: t.leadCount > 0 ? t.conversions / t.leadCount : 0,
  };
}

export function sumTotals(rows: RollupTotals[]): RollupTotals {
  return rows.reduce(
    (acc, r) => ({
      leadCount: acc.leadCount + r.leadCount,
      hqLeadCount: acc.hqLeadCount + r.hqLeadCount,
      suppressCount: acc.suppressCount + r.suppressCount,
      spendCents: acc.spendCents + r.spendCents,
      revenueCents: acc.revenueCents + r.revenueCents,
      hqRevenueCents: acc.hqRevenueCents + r.hqRevenueCents,
      conversions: acc.conversions + r.conversions,
      scoreSum: acc.scoreSum + r.scoreSum,
    }),
    {
      leadCount: 0,
      hqLeadCount: 0,
      suppressCount: 0,
      spendCents: 0,
      revenueCents: 0,
      hqRevenueCents: 0,
      conversions: 0,
      scoreSum: 0,
    },
  );
}
