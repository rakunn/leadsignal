import { FLAG_THRESHOLDS, VALUE_BLEND } from "./constants";
import type { RawLead } from "./types";
import type { SubScoreResult } from "./validity";

interface SourceStat {
  revenueCents: number;
  count: number;
}

export interface ValueNorms {
  sourceValueFor(lead: RawLead): number;
  /** Percentile (0–100) of a blended source value among distinct source values. */
  percentileOf(sourceValue: number): number;
}

function addStat(map: Map<string, SourceStat>, key: string, lead: RawLead) {
  const stat = map.get(key) ?? { revenueCents: 0, count: 0 };
  stat.revenueCents += lead.revenueCents;
  stat.count += 1;
  map.set(key, stat);
}

function revPerLead(stat: SourceStat | undefined): number {
  if (!stat || stat.count === 0) return 0;
  return stat.revenueCents / stat.count;
}

/**
 * Pass-1 value norms: expected revenue per lead by campaign and landing page.
 * A lead's "source value" blends the two; leads are then ranked into
 * percentile tiers across the dataset's distinct source values.
 */
export function buildValueNorms(leads: RawLead[]): ValueNorms {
  const byCampaign = new Map<string, SourceStat>();
  const byLandingPage = new Map<string, SourceStat>();

  for (const lead of leads) {
    addStat(byCampaign, lead.campaign, lead);
    if (lead.landingPage) addStat(byLandingPage, lead.landingPage, lead);
  }

  function sourceValueFor(lead: RawLead): number {
    const campaignValue = revPerLead(byCampaign.get(lead.campaign));
    const lpValue = lead.landingPage
      ? revPerLead(byLandingPage.get(lead.landingPage))
      : campaignValue;
    return (
      VALUE_BLEND.campaign * campaignValue + VALUE_BLEND.landingPage * lpValue
    );
  }

  const distinct = [...new Set(leads.map(sourceValueFor))].sort(
    (a, b) => a - b,
  );

  function percentileOf(sourceValue: number): number {
    if (distinct.length <= 1) return 50;
    // Distinct-value tier rank: where does this source sit among the
    // dataset's distinct blended source values?
    let idx = distinct.findIndex((v) => v >= sourceValue);
    if (idx === -1) idx = distinct.length - 1;
    return Math.round((idx / (distinct.length - 1)) * 100);
  }

  return { sourceValueFor, percentileOf };
}

export function computeValue(lead: RawLead, norms: ValueNorms): SubScoreResult {
  const sourceValue = norms.sourceValueFor(lead);
  const score = norms.percentileOf(sourceValue);
  const flags: SubScoreResult["flags"] =
    score < FLAG_THRESHOLDS.lowValueSourceBelow ? ["low_value_source"] : [];
  return {
    score,
    flags,
    items: [
      {
        scope: "value",
        rule: "source_value",
        detail: `source expects $${(sourceValue / 100).toFixed(2)}/lead — tier ${score}/100 (+${score})`,
        points: score,
      },
    ],
  };
}
