import { and, asc, eq, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { datasets, leads, rollupDimension, rollups } from "@/db/schema";
import { CplInversionChart } from "@/components/charts/cpl-inversion-chart";
import { QualityTrendChart } from "@/components/charts/quality-trend-chart";
import { SegmentMix } from "@/components/charts/segment-mix";
import { DimSwitcher } from "@/components/dim-switcher";
import { StatTile } from "@/components/stat-tile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { assignSeriesColors } from "@/lib/chart-colors";
import { fmtInt, fmtPct, fmtUsdFromCents } from "@/lib/format";
import { deriveMetrics, sumTotals } from "@/lib/metrics";
import {
  rollupTotalsByValue as totalsBy,
  type Dimension,
  type ValueTotals,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const DIMENSIONS = new Set(rollupDimension.enumValues);

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const dim: Dimension = DIMENSIONS.has(sp.dim as Dimension)
    ? (sp.dim as Dimension)
    : "campaign";

  const dimColumn = {
    campaign: leads.campaign,
    ad_set: leads.adSet,
    creative: leads.creative,
    platform: leads.platform,
    landing_page: leads.landingPage,
  }[dim];

  const [byValue, daily, segmentRows, creatives, landingPages, [v4], campaignTotals, [dataset]] =
    await Promise.all([
      totalsBy(id, dim),
      db
        .select({
          day: rollups.day,
          value: rollups.dimensionValue,
          leadCount: rollups.leadCount,
          hqLeadCount: rollups.hqLeadCount,
        })
        .from(rollups)
        .where(and(eq(rollups.datasetId, id), eq(rollups.dimension, dim)))
        .orderBy(asc(rollups.day)),
      db
        .select({
          value: dimColumn,
          segment: leads.segment,
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(leads)
        .where(eq(leads.datasetId, id))
        .groupBy(dimColumn, leads.segment),
      totalsBy(id, "creative"),
      totalsBy(id, "landing_page"),
      db
        .select({ firstDay: min(rollups.day) })
        .from(rollups)
        .where(
          and(
            eq(rollups.datasetId, id),
            eq(rollups.dimension, "landing_page"),
            eq(rollups.dimensionValue, "lp-search-v4"),
          ),
        ),
      dim === "campaign" ? Promise.resolve(null) : totalsBy(id, "campaign"),
      db.select({ status: datasets.status }).from(datasets).where(eq(datasets.id, id)).limit(1),
    ]);

  const datasetTotals = sumTotals(campaignTotals ?? byValue);
  const overall = deriveMetrics(datasetTotals);
  const missingDimensionRows = datasetTotals.leadCount - sumTotals(byValue).leadCount;
  const dimensionLabel = { campaign: "campaign", ad_set: "ad set", creative: "creative", platform: "platform", landing_page: "landing page" }[dim];
  const emptyMessage = dataset?.status === "error"
    ? "Dataset processing failed. Return to datasets to review the error."
    : dataset?.status === "processing" || dataset?.status === "scoring"
      ? "This dataset is still processing."
      : `No ${dimensionLabel} values in this dataset.`;

  // Top values by spend get chart slots; stable colors by sorted name.
  const topValues = [...byValue]
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, 5);
  const colorMap = assignSeriesColors(topValues.map((v) => v.value));

  const cplRows = [...topValues]
    .map((v) => {
      const m = deriveMetrics(v);
      return {
        name: v.value,
        rawCpl: m.rawCplCents !== null ? m.rawCplCents / 100 : null,
        // Fewer than 5 HQ leads → the ratio is noise (and would blow up the
        // axis); show "no reliable qualified CPL" instead.
        qualifiedCpl:
          m.qualifiedCplCents !== null && v.hqLeadCount >= 5
            ? m.qualifiedCplCents / 100
            : null,
      };
    })
    .sort((a, b) => (a.rawCpl ?? 0) - (b.rawCpl ?? 0));

  const days = [...new Set(daily.map((d) => d.day))].sort();
  const topSet = new Set(topValues.map((v) => v.value));
  const seriesMap = new Map<string, Record<string, { hq: number; total: number }>>();
  for (const row of daily) {
    if (!topSet.has(row.value)) continue;
    const byDay = seriesMap.get(row.value) ?? {};
    const agg = byDay[row.day] ?? { hq: 0, total: 0 };
    agg.hq += row.hqLeadCount;
    agg.total += row.leadCount;
    byDay[row.day] = agg;
    seriesMap.set(row.value, byDay);
  }
  const trendSeries = [...seriesMap.entries()].map(([name, byDay]) => ({
    name,
    color: colorMap.get(name) ?? "#8A8F94",
    points: Object.fromEntries(
      Object.entries(byDay)
        .filter(([, v]) => v.total >= 3)
        .map(([day, v]) => [day, v.hq / v.total]),
    ),
  }));

  const mixRows = topValues.map((v) => ({
    name: v.value,
    counts: Object.fromEntries(
      segmentRows
        .filter((s) => s.value === v.value && s.segment)
        .map((s) => [s.segment as string, s.count]),
    ),
  }));

  const rankable = (list: ValueTotals[]) =>
    list
      .filter((v) => v.leadCount >= 30 && v.hqLeadCount > 0)
      .map((v) => ({ value: v.value, ...deriveMetrics(v), leads: v.leadCount }))
      .sort((a, b) => (a.qualifiedCplCents ?? 0) - (b.qualifiedCplCents ?? 0));

  const creativeRank = rankable(creatives);
  const lpRank = rankable(landingPages);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Campaign quality
        </h2>
        <DimSwitcher />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Spend"
          value={fmtUsdFromCents(datasetTotals.spendCents)}
          sub={`${fmtInt(datasetTotals.leadCount)} leads ingested`}
        />
        <StatTile
          label="High-quality rate"
          value={fmtPct(overall.hqRate, 1)}
          sub={`${fmtInt(datasetTotals.hqLeadCount)} leads worth pursuing`}
          tone={overall.hqRate >= 0.35 ? "high" : overall.hqRate < 0.2 ? "low" : "mid"}
        />
        <StatTile
          label="Qualified CPL"
          value={
            overall.qualifiedCplCents !== null
              ? fmtUsdFromCents(overall.qualifiedCplCents)
              : "—"
          }
          sub={`raw CPL ${overall.rawCplCents !== null ? fmtUsdFromCents(overall.rawCplCents) : "—"}`}
        />
        <StatTile
          label="Quality-adjusted ROAS"
          value={
            overall.qualityAdjustedRoas !== null
              ? `${overall.qualityAdjustedRoas.toFixed(2)}×`
              : "—"
          }
          sub={`raw ROAS ${overall.roas !== null ? `${overall.roas.toFixed(2)}×` : "—"}`}
        />
      </div>

      {missingDimensionRows > 0 && byValue.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {fmtInt(missingDimensionRows)} lead{missingDimensionRows === 1 ? "" : "s"} without {dimensionLabel} values are omitted from these charts. Headline totals include all leads.
        </p>
      )}
      {byValue.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : <>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">
            The cheapest lead is not the cheapest customer
          </CardTitle>
          <CardDescription>
            Sorted by raw CPL — the metric ad platforms optimize. The teal bar
            is what a usable lead actually costs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CplInversionChart data={cplRows} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="font-heading">Quality trend</CardTitle>
            <CardDescription>
              Daily high-quality-lead rate. Dips mean you&apos;re buying more
              junk for the same spend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QualityTrendChart
              days={days}
              series={trendSeries}
              annotation={
                v4?.firstDay
                  ? { day: v4.firstDay, label: "lp-search-v4 live" }
                  : null
              }
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-heading">Quality mix</CardTitle>
            <CardDescription>Where each source&apos;s leads land.</CardDescription>
          </CardHeader>
          <CardContent>
            <SegmentMix rows={mixRows} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankTable
          title="Creatives by qualified CPL"
          rows={creativeRank}
          emptyNote="Needs ≥ 30 leads per creative."
        />
        <RankTable
          title="Landing pages by qualified CPL"
          rows={lpRank}
          emptyNote="Needs ≥ 30 leads per landing page."
        />
      </div>
      </>}
    </div>
  );
}

function RankTable({
  title,
  rows,
  emptyNote,
}: {
  title: string;
  rows: Array<{
    value: string;
    leads: number;
    rawCplCents: number | null;
    qualifiedCplCents: number | null;
    hqRate: number;
  }>;
  emptyNote: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">{title}</CardTitle>
        <CardDescription>
          Best at the top, worst at the bottom. {emptyNote}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough volume to rank yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Raw CPL</TableHead>
                <TableHead className="text-right">Qualified CPL</TableHead>
                <TableHead className="text-right">HQ rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.value}>
                  <TableCell className="max-w-40 truncate font-medium">
                    {r.value}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {fmtInt(r.leads)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.rawCplCents !== null ? fmtUsdFromCents(r.rawCplCents) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.qualifiedCplCents !== null
                      ? fmtUsdFromCents(r.qualifiedCplCents)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {fmtPct(r.hqRate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
