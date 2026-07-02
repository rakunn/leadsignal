import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, asc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { actions, leads, leadSegment } from "@/db/schema";
import { deriveMetrics, sumTotals } from "@/lib/metrics";
import {
  rollupDaily,
  rollupTotalsByValue,
  type Dimension,
} from "@/lib/queries";
import { RecommendationCardSchema } from "./schemas";

const DimensionEnum = z.enum([
  "campaign",
  "ad_set",
  "creative",
  "platform",
  "landing_page",
]);
const DateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("ISO date YYYY-MM-DD");

const usd = (cents: number | null) =>
  cents === null ? null : `$${(cents / 100).toFixed(2)}`;
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;

function metricsView(t: Parameters<typeof deriveMetrics>[0]) {
  const m = deriveMetrics(t);
  return {
    leads: t.leadCount,
    hqLeads: t.hqLeadCount,
    hqRate: pct(m.hqRate),
    suppressRate: pct(m.suppressRate),
    spend: usd(t.spendCents),
    rawCpl: usd(m.rawCplCents),
    qualifiedCpl: t.hqLeadCount >= 5 ? usd(m.qualifiedCplCents) : null,
    qualifiedCplNote:
      t.hqLeadCount < 5 ? `unreliable — only ${t.hqLeadCount} HQ leads` : undefined,
    avgScore: m.avgScore,
    revenue: usd(t.revenueCents),
    revenuePerLead: usd(m.revenuePerLeadCents),
    qualityAdjustedRoas:
      m.qualityAdjustedRoas !== null
        ? `${m.qualityAdjustedRoas.toFixed(2)}x`
        : null,
    conversionRate: pct(m.conversionRate),
  };
}

export interface AnalystEmitter {
  toolResult(name: string, summary: string): void;
  card(action: {
    id: string;
    status: string;
    createdAt: string;
    card: z.infer<typeof RecommendationCardSchema>;
  }): void;
}

/** Build the analyst's tool belt, scoped to one dataset. */
export function buildAnalystTools(
  datasetId: string,
  conversationId: string,
  emit: AnalystEmitter,
) {
  const getDatasetOverview = betaZodTool({
    name: "get_dataset_overview",
    description:
      "Totals for the whole dataset: date range, spend, leads, HQ rate, raw vs qualified CPL, segment distribution, and the list of campaigns/platforms. Call this first when orienting.",
    inputSchema: z.object({}),
    run: async () => {
      const [byCampaign, segments, range] = await Promise.all([
        rollupTotalsByValue(datasetId, "campaign"),
        db
          .select({
            segment: leads.segment,
            count: sql<number>`count(*)::int`.mapWith(Number),
          })
          .from(leads)
          .where(eq(leads.datasetId, datasetId))
          .groupBy(leads.segment),
        db
          .select({
            from: sql<string>`min(created_at)::date`,
            to: sql<string>`max(created_at)::date`,
          })
          .from(leads)
          .where(eq(leads.datasetId, datasetId)),
      ]);
      const result = {
        dateRange: range[0],
        totals: metricsView(sumTotals(byCampaign)),
        campaigns: byCampaign
          .sort((a, b) => b.spendCents - a.spendCents)
          .map((c) => c.value),
        segmentCounts: Object.fromEntries(
          segments.filter((s) => s.segment).map((s) => [s.segment, s.count]),
        ),
        definitions: {
          hqLead: "composite score >= 70 and segment != suppress",
          qualifiedCpl: "spend / HQ leads",
        },
      };
      emit.toolResult(
        "get_dataset_overview",
        `${result.totals.leads} leads, HQ ${result.totals.hqRate}`,
      );
      return JSON.stringify(result);
    },
  });

  const getCampaignMetrics = betaZodTool({
    name: "get_campaign_metrics",
    description:
      "Quality metrics grouped by a dimension (campaign, ad_set, creative, platform, landing_page): raw vs qualified CPL, HQ rate, suppress rate, revenue, quality-adjusted ROAS. Optionally filter to one value or a date window.",
    inputSchema: z.object({
      dimension: DimensionEnum,
      filterValue: z.string().optional().describe("Only this dimension value"),
      dateFrom: DateStr.optional(),
      dateTo: DateStr.optional(),
    }),
    run: async (input) => {
      let rows = await rollupTotalsByValue(
        datasetId,
        input.dimension as Dimension,
        { dateFrom: input.dateFrom, dateTo: input.dateTo },
      );
      if (input.filterValue) rows = rows.filter((r) => r.value === input.filterValue);
      const result = rows
        .sort((a, b) => b.spendCents - a.spendCents)
        .slice(0, 20)
        .map((r) => ({ [input.dimension]: r.value, ...metricsView(r) }));
      emit.toolResult(
        "get_campaign_metrics",
        `${result.length} ${input.dimension} rows`,
      );
      return JSON.stringify({ rows: result, truncatedTo: 20 });
    },
  });

  const getQualityTrend = betaZodTool({
    name: "get_quality_trend",
    description:
      "Daily quality series (leads, HQ rate, qualified CPL, average score) for the whole dataset or one dimension value. Use to answer 'when did quality change' questions.",
    inputSchema: z.object({
      dimension: DimensionEnum.optional().describe("Defaults to campaign"),
      value: z.string().optional().describe("A specific campaign/creative/etc."),
      dateFrom: DateStr.optional(),
      dateTo: DateStr.optional(),
    }),
    run: async (input) => {
      const daily = await rollupDaily(
        datasetId,
        (input.dimension ?? "campaign") as Dimension,
        { value: input.value, dateFrom: input.dateFrom, dateTo: input.dateTo },
      );
      const result = daily.slice(-45).map((d) => {
        const m = deriveMetrics(d);
        return {
          day: d.day,
          leads: d.leadCount,
          hqRate: pct(m.hqRate),
          qualifiedCpl: d.hqLeadCount >= 3 ? usd(m.qualifiedCplCents) : null,
          avgScore: m.avgScore,
        };
      });
      emit.toolResult(
        "get_quality_trend",
        `${result.length} days${input.value ? ` for ${input.value}` : ""}`,
      );
      return JSON.stringify({ days: result });
    },
  });

  const comparePeriods = betaZodTool({
    name: "compare_periods",
    description:
      "Compare two date windows per dimension value: HQ rate, qualified CPL and lead volume in each period plus the deltas. The go-to tool for 'what changed?'",
    inputSchema: z.object({
      dimension: DimensionEnum,
      periodAFrom: DateStr,
      periodATo: DateStr,
      periodBFrom: DateStr,
      periodBTo: DateStr,
    }),
    run: async (input) => {
      const [a, b] = await Promise.all([
        rollupTotalsByValue(datasetId, input.dimension as Dimension, {
          dateFrom: input.periodAFrom,
          dateTo: input.periodATo,
        }),
        rollupTotalsByValue(datasetId, input.dimension as Dimension, {
          dateFrom: input.periodBFrom,
          dateTo: input.periodBTo,
        }),
      ]);
      const aMap = new Map(a.map((r) => [r.value, r]));
      const values = new Set([...a, ...b].map((r) => r.value));
      const rows = [...values]
        .map((value) => {
          const ra = aMap.get(value);
          const rb = b.find((r) => r.value === value);
          const ma = ra ? deriveMetrics(ra) : null;
          const mb = rb ? deriveMetrics(rb) : null;
          return {
            [input.dimension]: value,
            periodA: ra
              ? { leads: ra.leadCount, hqRate: pct(ma!.hqRate), qualifiedCpl: usd(ma!.qualifiedCplCents) }
              : null,
            periodB: rb
              ? { leads: rb.leadCount, hqRate: pct(mb!.hqRate), qualifiedCpl: usd(mb!.qualifiedCplCents) }
              : null,
            hqRateDeltaPp:
              ma && mb ? Number(((mb.hqRate - ma.hqRate) * 100).toFixed(1)) : null,
            leadsA: ra?.leadCount ?? 0,
          };
        })
        .sort((x, y) => y.leadsA - x.leadsA)
        .slice(0, 20);
      emit.toolResult("compare_periods", `${rows.length} ${input.dimension} rows`);
      return JSON.stringify({ rows });
    },
  });

  const getLeadSample = betaZodTool({
    name: "get_lead_sample",
    description:
      "Concrete example leads with their scores, risk flags and scoring receipts — the evidence layer. Filter by campaign, segment, risk flag, or score range.",
    inputSchema: z.object({
      campaign: z.string().optional(),
      segment: z
        .enum(["high_value", "nurture", "test", "suppress", "review"])
        .optional(),
      riskFlag: z
        .enum([
          "invalid_email",
          "disposable_email",
          "invalid_phone",
          "duplicate",
          "burst_submission",
          "no_engagement",
          "low_value_source",
          "high_cost_low_quality",
        ])
        .optional(),
      minScore: z.number().int().min(0).max(100).optional(),
      maxScore: z.number().int().min(0).max(100).optional(),
      limit: z.number().int().min(1).max(20).optional().describe("Default 10"),
    }),
    run: async (input) => {
      const conditions: SQL[] = [eq(leads.datasetId, datasetId)];
      if (input.campaign) conditions.push(eq(leads.campaign, input.campaign));
      if (input.segment) {
        conditions.push(
          eq(leads.segment, input.segment as (typeof leadSegment.enumValues)[number]),
        );
      }
      if (input.riskFlag) {
        conditions.push(
          sql`${leads.riskFlags} @> ${JSON.stringify([input.riskFlag])}::jsonb`,
        );
      }
      if (input.minScore !== undefined)
        conditions.push(gte(leads.compositeScore, input.minScore));
      if (input.maxScore !== undefined)
        conditions.push(lte(leads.compositeScore, input.maxScore));

      const rows = await db
        .select({
          email: leads.email,
          campaign: leads.campaign,
          creative: leads.creative,
          landingPage: leads.landingPage,
          costCents: leads.costCents,
          compositeScore: leads.compositeScore,
          validityScore: leads.validityScore,
          intentScore: leads.intentScore,
          valueScore: leads.valueScore,
          segment: leads.segment,
          riskFlags: leads.riskFlags,
          emailOpened: leads.emailOpened,
          emailClicked: leads.emailClicked,
          converted: leads.converted,
          revenueCents: leads.revenueCents,
        })
        .from(leads)
        .where(and(...conditions))
        .orderBy(asc(leads.compositeScore))
        .limit(input.limit ?? 10);
      emit.toolResult("get_lead_sample", `${rows.length} leads`);
      return JSON.stringify({
        leads: rows.map((r) => ({
          ...r,
          cost: usd(r.costCents),
          revenue: usd(r.revenueCents),
          costCents: undefined,
          revenueCents: undefined,
        })),
      });
    },
  });

  const simulateBudgetShift = betaZodTool({
    name: "simulate_budget_shift",
    description:
      "Deterministic linear projection of moving budget between campaigns: expected HQ-lead and revenue change at each campaign's current qualified CPL and revenue-per-HQ-lead. State that it assumes CPLs hold at current levels. Makes NO changes.",
    inputSchema: z.object({
      shifts: z
        .array(
          z.object({
            campaign: z.string(),
            deltaBudgetUsd: z
              .number()
              .describe("Positive = add budget, negative = remove"),
          }),
        )
        .min(1)
        .max(6),
    }),
    run: async (input) => {
      const byCampaign = await rollupTotalsByValue(datasetId, "campaign");
      const results = input.shifts.map((shift) => {
        const row = byCampaign.find((c) => c.value === shift.campaign);
        if (!row) return { campaign: shift.campaign, error: "unknown campaign" };
        const m = deriveMetrics(row);
        if (m.qualifiedCplCents === null || row.hqLeadCount < 5) {
          return {
            campaign: shift.campaign,
            error: "no reliable qualified CPL — too few HQ leads to project",
          };
        }
        const deltaCents = Math.round(shift.deltaBudgetUsd * 100);
        const deltaHq = deltaCents / m.qualifiedCplCents;
        const revPerHq = row.hqLeadCount > 0 ? row.hqRevenueCents / row.hqLeadCount : 0;
        return {
          campaign: shift.campaign,
          deltaBudget: usd(deltaCents),
          currentQualifiedCpl: usd(m.qualifiedCplCents),
          projectedHqLeadChange: Number(deltaHq.toFixed(1)),
          projectedRevenueChange: usd(Math.round(deltaHq * revPerHq)),
        };
      });
      const totalHq = results.reduce(
        (acc, r) => acc + ("projectedHqLeadChange" in r ? (r.projectedHqLeadChange ?? 0) : 0),
        0,
      );
      emit.toolResult(
        "simulate_budget_shift",
        `net ${totalHq >= 0 ? "+" : ""}${totalHq.toFixed(1)} HQ leads`,
      );
      return JSON.stringify({
        assumption:
          "Linear projection: assumes each campaign's qualified CPL and revenue-per-HQ-lead hold at current levels.",
        results,
        netProjectedHqLeadChange: Number(totalHq.toFixed(1)),
      });
    },
  });

  const logRecommendedAction = betaZodTool({
    name: "log_recommended_action",
    description:
      "Record a concrete media-buying recommendation. This renders an approval card in the UI (simulation only — never touches live ad accounts). Use after your analysis supports a specific change. At most 2-3 per turn.",
    inputSchema: RecommendationCardSchema,
    run: async (input) => {
      const [row] = await db
        .insert(actions)
        .values({
          datasetId,
          conversationId,
          type: input.type,
          payload: { targets: input.targets, params: input.params ?? null },
          rationale: input.rationale,
          estimatedImpact: input.estimatedImpact,
          confidence: input.confidence,
        })
        .returning({
          id: actions.id,
          status: actions.status,
          createdAt: actions.createdAt,
        });
      emit.card({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        card: input,
      });
      emit.toolResult("log_recommended_action", input.type);
      return JSON.stringify({
        actionId: row.id,
        status: "proposed",
        note: "Card shown to the user for approval (simulated).",
      });
    },
  });

  return [
    getDatasetOverview,
    getCampaignMetrics,
    getQualityTrend,
    comparePeriods,
    getLeadSample,
    simulateBudgetShift,
    logRecommendedAction,
  ];
}
