import { describe, expect, test } from "vitest";
import { generateSampleLeads, SAMPLE_SEED } from "@/lib/sample-data/generate";
import { CAMPAIGNS } from "@/lib/sample-data/config";
import { isHighQuality } from "@/lib/scoring/constants";
import { scoreLeads } from "@/lib/scoring/score";
import type { RawLead } from "@/lib/scoring/types";

const ANCHOR = new Date("2026-06-30T00:00:00Z");

interface CampaignAgg {
  leads: number;
  hq: number;
  spendCents: number;
  revenueCents: number;
}

function aggregate(rows: RawLead[]) {
  const scores = scoreLeads(rows);
  const byCampaign = new Map<string, CampaignAgg>();
  rows.forEach((r, i) => {
    const agg = byCampaign.get(r.campaign) ?? {
      leads: 0,
      hq: 0,
      spendCents: 0,
      revenueCents: 0,
    };
    agg.leads++;
    agg.spendCents += r.costCents;
    agg.revenueCents += r.revenueCents;
    if (isHighQuality(scores[i].compositeScore, scores[i].segment)) agg.hq++;
    byCampaign.set(r.campaign, agg);
  });
  return { scores, byCampaign };
}

const rawCplUsd = (a: CampaignAgg) => a.spendCents / a.leads / 100;
const qualifiedCplUsd = (a: CampaignAgg) =>
  a.hq > 0 ? a.spendCents / a.hq / 100 : Infinity;

/**
 * THE demo-story guardrail. If a scoring-weight or generator tweak breaks the
 * pitch numbers, this fails loudly in CI. Tolerance bands, not exact values.
 */
describe("demo story", () => {
  const rows = generateSampleLeads(SAMPLE_SEED, ANCHOR);
  const { byCampaign } = aggregate(rows);
  const A = byCampaign.get(CAMPAIGNS.broad.name)!;
  const B = byCampaign.get(CAMPAIGNS.search.name)!;
  const C = byCampaign.get(CAMPAIGNS.retargeting.name)!;

  test("Campaign A: cheapest raw CPL (~$1.20) but worst qualified CPL (~$8.40)", () => {
    expect(rawCplUsd(A)).toBeGreaterThan(1.05);
    expect(rawCplUsd(A)).toBeLessThan(1.35);
    expect(qualifiedCplUsd(A)).toBeGreaterThan(7.5);
    expect(qualifiedCplUsd(A)).toBeLessThan(9.5);
  });

  test("Campaign B: raw ~$2.10, qualified ~$4.60 — the real winner", () => {
    expect(rawCplUsd(B)).toBeGreaterThan(1.9);
    expect(rawCplUsd(B)).toBeLessThan(2.3);
    expect(qualifiedCplUsd(B)).toBeGreaterThan(4.0);
    expect(qualifiedCplUsd(B)).toBeLessThan(5.4);
  });

  test("Campaign C: raw ~$2.70, qualified ~$5.10, top revenue and ROAS", () => {
    expect(rawCplUsd(C)).toBeGreaterThan(2.5);
    expect(rawCplUsd(C)).toBeLessThan(2.9);
    expect(qualifiedCplUsd(C)).toBeGreaterThan(4.4);
    expect(qualifiedCplUsd(C)).toBeLessThan(5.9);

    for (const [name, agg] of byCampaign) {
      if (name === CAMPAIGNS.retargeting.name) continue;
      expect(C.revenueCents / C.leads).toBeGreaterThan(
        agg.revenueCents / agg.leads,
      );
      expect(C.revenueCents / C.spendCents).toBeGreaterThan(
        agg.revenueCents / agg.spendCents,
      );
    }
  });

  test("the raw-CPL ranking inverts under qualified CPL: A cheapest raw, most expensive qualified", () => {
    expect(rawCplUsd(A)).toBeLessThan(rawCplUsd(B));
    expect(rawCplUsd(A)).toBeLessThan(rawCplUsd(C));
    expect(qualifiedCplUsd(A)).toBeGreaterThan(qualifiedCplUsd(B));
    expect(qualifiedCplUsd(A)).toBeGreaterThan(qualifiedCplUsd(C));
  });

  test("Campaign B quality visibly drops after the lp-v4 launch (~day 18)", () => {
    const scores = scoreLeads(rows);
    const start = ANCHOR.getTime() - 30 * 86_400_000;
    let preLeads = 0;
    let preHq = 0;
    let postLeads = 0;
    let postHq = 0;
    rows.forEach((r, i) => {
      if (r.campaign !== CAMPAIGNS.search.name) return;
      const day = Math.floor((r.createdAt.getTime() - start) / 86_400_000);
      const hq = isHighQuality(scores[i].compositeScore, scores[i].segment);
      if (day < 17) {
        preLeads++;
        if (hq) preHq++;
      } else if (day >= 18) {
        postLeads++;
        if (hq) postHq++;
      }
    });
    const preRate = preHq / preLeads;
    const postRate = postHq / postLeads;
    expect(preRate - postRate).toBeGreaterThan(0.1);
  });

  test("burst events exist on Campaign A landing pages", () => {
    const scores = scoreLeads(rows);
    const burstCount = rows.filter(
      (r, i) =>
        r.campaign === CAMPAIGNS.broad.name &&
        scores[i].riskFlags.includes("burst_submission"),
    ).length;
    expect(burstCount).toBeGreaterThanOrEqual(30);
  });
});
