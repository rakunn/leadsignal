import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rollups, type rollupDimension } from "@/db/schema";
import type { RollupTotals } from "@/lib/metrics";

export type Dimension = (typeof rollupDimension.enumValues)[number];

export interface ValueTotals extends RollupTotals {
  value: string;
}

function rollupConditions(
  datasetId: string,
  dimension: Dimension,
  opts?: { value?: string; dateFrom?: string; dateTo?: string },
): SQL[] {
  const conditions: SQL[] = [
    eq(rollups.datasetId, datasetId),
    eq(rollups.dimension, dimension),
  ];
  if (opts?.value) conditions.push(eq(rollups.dimensionValue, opts.value));
  if (opts?.dateFrom) conditions.push(gte(rollups.day, opts.dateFrom));
  if (opts?.dateTo) conditions.push(lte(rollups.day, opts.dateTo));
  return conditions;
}

const SUMS = {
  leadCount: sql<number>`sum(${rollups.leadCount})`.mapWith(Number),
  hqLeadCount: sql<number>`sum(${rollups.hqLeadCount})`.mapWith(Number),
  suppressCount: sql<number>`sum(${rollups.suppressCount})`.mapWith(Number),
  spendCents: sql<number>`sum(${rollups.spendCents})`.mapWith(Number),
  revenueCents: sql<number>`sum(${rollups.revenueCents})`.mapWith(Number),
  hqRevenueCents: sql<number>`sum(${rollups.hqRevenueCents})`.mapWith(Number),
  conversions: sql<number>`sum(${rollups.conversions})`.mapWith(Number),
  scoreSum: sql<number>`sum(${rollups.scoreSum})`.mapWith(Number),
};

/** Totals per dimension value (whole range or a date window). */
export async function rollupTotalsByValue(
  datasetId: string,
  dimension: Dimension,
  opts?: { dateFrom?: string; dateTo?: string },
): Promise<ValueTotals[]> {
  return db
    .select({ value: rollups.dimensionValue, ...SUMS })
    .from(rollups)
    .where(and(...rollupConditions(datasetId, dimension, opts)))
    .groupBy(rollups.dimensionValue);
}

export interface DailyTotals extends RollupTotals {
  day: string;
}

/** Daily totals for one dimension (optionally a single value). */
export async function rollupDaily(
  datasetId: string,
  dimension: Dimension,
  opts?: { value?: string; dateFrom?: string; dateTo?: string },
): Promise<DailyTotals[]> {
  return db
    .select({ day: rollups.day, ...SUMS })
    .from(rollups)
    .where(and(...rollupConditions(datasetId, dimension, opts)))
    .groupBy(rollups.day)
    .orderBy(asc(rollups.day));
}
