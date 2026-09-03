import Link from "next/link";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { leads, type leadSegment } from "@/db/schema";
import { LeadsFilters } from "@/components/leads-filters";
import { LeadsTable, type LeadRowData } from "@/components/leads-table";
import { Button } from "@/components/ui/button";
import { fmtInt } from "@/lib/format";
import { normalizePage } from "@/lib/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEGMENTS = new Set([
  "high_value",
  "nurture",
  "test",
  "suppress",
  "review",
]);

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const segment = typeof sp.segment === "string" ? sp.segment : undefined;
  const campaign = typeof sp.campaign === "string" ? sp.campaign : undefined;
  const flag = typeof sp.flag === "string" ? sp.flag : undefined;
  const sort = typeof sp.sort === "string" ? sp.sort : "score_asc";

  const conditions: SQL[] = [eq(leads.datasetId, id)];
  if (segment && SEGMENTS.has(segment)) {
    conditions.push(
      eq(leads.segment, segment as (typeof leadSegment.enumValues)[number]),
    );
  }
  if (campaign) conditions.push(eq(leads.campaign, campaign));
  if (flag && /^[a-z_]+$/.test(flag)) {
    conditions.push(sql`${leads.riskFlags} @> ${JSON.stringify([flag])}::jsonb`);
  }
  const where = and(...conditions);

  const orderBy =
    sort === "created_desc"
      ? [desc(leads.createdAt)]
      : sort === "cost_desc"
        ? [desc(leads.costCents)]
        : sort === "score_desc"
          ? [desc(leads.compositeScore), asc(leads.id)]
          : [asc(leads.compositeScore), asc(leads.id)];

  const [[{ count }], campaignRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(where),
    db.selectDistinct({ campaign: leads.campaign }).from(leads)
      .where(eq(leads.datasetId, id)).orderBy(asc(leads.campaign)),
  ]);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = normalizePage(sp.page, totalPages);
  const rows = await db.select().from(leads).where(where)
    .orderBy(...orderBy).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

  const data: LeadRowData[] = rows.map((l) => ({
    id: l.id,
    email: l.email,
    phone: l.phone,
    campaign: l.campaign,
    creative: l.creative,
    platform: l.platform,
    landingPage: l.landingPage,
    costCents: l.costCents,
    emailOpened: l.emailOpened,
    emailClicked: l.emailClicked,
    smsClicked: l.smsClicked,
    converted: l.converted,
    revenueCents: l.revenueCents,
    validityScore: l.validityScore,
    intentScore: l.intentScore,
    valueScore: l.valueScore,
    compositeScore: l.compositeScore,
    conversionProbability: l.conversionProbability,
    segment: l.segment,
    riskFlags: l.riskFlags,
    scoreBreakdown: l.scoreBreakdown,
    isDuplicate: l.isDuplicate,
    createdAtIso: l.createdAt.toISOString(),
    explanation: l.explanation,
  }));

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (segment) params.set("segment", segment);
    if (campaign) params.set("campaign", campaign);
    if (flag) params.set("flag", flag);
    if (sort !== "score_asc") params.set("sort", sort);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/datasets/${id}/leads${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <LeadsFilters campaigns={campaignRows.map((c) => c.campaign)} />
        <p className="text-sm text-muted-foreground">
          {fmtInt(count)} lead{count === 1 ? "" : "s"}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No leads match these filters.
        </div>
      ) : (
        <LeadsTable rows={data} />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          {page <= 1 ? (
            <Button variant="outline" size="sm" disabled>Previous</Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={pageHref(page - 1)}>Previous</Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page >= totalPages ? (
            <Button variant="outline" size="sm" disabled>Next</Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={pageHref(page + 1)}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
