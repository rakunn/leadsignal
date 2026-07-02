/**
 * Integration test for the analyst tool handlers against a live local DB.
 * Skipped unless RUN_DB_TESTS=1 (needs docker-compose Postgres + a ready
 * sample dataset). Run: RUN_DB_TESTS=1 npx vitest run tests/analyst-tools.int.test.ts
 */
import { describe, expect, test } from "vitest";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("analyst tools (integration)", () => {
  test("all seven tools return well-formed JSON against the sample dataset", async () => {
    const { db } = await import("@/db");
    const { datasets } = await import("@/db/schema");
    const { desc, eq } = await import("drizzle-orm");
    const { buildAnalystTools } = await import("@/lib/analyst/tools");

    const [dataset] = await db
      .select({ id: datasets.id })
      .from(datasets)
      .where(eq(datasets.status, "ready"))
      .orderBy(desc(datasets.createdAt))
      .limit(1);
    expect(dataset).toBeDefined();

    const emitted: string[] = [];
    const cards: unknown[] = [];
    const tools = buildAnalystTools(dataset.id, "00000000-0000-0000-0000-000000000000", {
      toolResult: (name) => emitted.push(name),
      card: (a) => cards.push(a),
    });
    expect(tools).toHaveLength(7);

    const byName = new Map(tools.map((t) => [t.name, t]));
    const call = async (name: string, input: unknown) => {
      const tool = byName.get(name)!;
      // BetaRunnableTool exposes the run callback we provided.
      const result = await (
        tool as unknown as { run: (i: unknown) => Promise<string> }
      ).run(input);
      return JSON.parse(result);
    };

    const overview = await call("get_dataset_overview", {});
    expect(overview.totals.leads).toBeGreaterThan(1000);
    expect(overview.campaigns.length).toBe(5);
    expect(overview.totals.qualifiedCpl).toMatch(/^\$/);

    const metrics = await call("get_campaign_metrics", { dimension: "campaign" });
    expect(metrics.rows.length).toBe(5);
    expect(metrics.rows[0]).toHaveProperty("rawCpl");

    const trend = await call("get_quality_trend", {
      dimension: "campaign",
      value: "Search — High Intent",
    });
    expect(trend.days.length).toBeGreaterThan(20);
    expect(trend.days[0]).toHaveProperty("hqRate");

    const dayFrom = trend.days[0].day as string;
    const dayMid = trend.days[15].day as string;
    const dayEnd = trend.days[trend.days.length - 1].day as string;
    const cmp = await call("compare_periods", {
      dimension: "campaign",
      periodAFrom: dayFrom,
      periodATo: dayMid,
      periodBFrom: dayMid,
      periodBTo: dayEnd,
    });
    expect(cmp.rows.length).toBeGreaterThan(0);
    expect(cmp.rows[0]).toHaveProperty("hqRateDeltaPp");

    const sample = await call("get_lead_sample", {
      segment: "suppress",
      limit: 5,
    });
    expect(sample.leads.length).toBeGreaterThan(0);
    expect(sample.leads[0].segment).toBe("suppress");

    const sim = await call("simulate_budget_shift", {
      shifts: [
        { campaign: "Broad Awareness — Instant Forms", deltaBudgetUsd: -500 },
        { campaign: "Search — High Intent", deltaBudgetUsd: 500 },
      ],
    });
    expect(sim.results).toHaveLength(2);
    expect(sim.netProjectedHqLeadChange).toBeGreaterThan(0);
    expect(sim.assumption).toContain("Linear");

    expect(emitted).toContain("get_dataset_overview");
    expect(emitted).toContain("simulate_budget_shift");
  });
});
