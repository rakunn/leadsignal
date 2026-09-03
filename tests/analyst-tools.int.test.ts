import { afterAll, beforeAll, describe, expect, test } from "vitest";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("analyst tools (integration)", () => {
  let fixture: Awaited<ReturnType<typeof import("./helpers/database").createDatasetFixture>>;
  let conversationId: string;
  beforeAll(async () => {
    const { createDatasetFixture, createConversationFixture } = await import("./helpers/database");
    const { generateSampleLeads, SAMPLE_SEED } = await import("@/lib/sample-data/generate");
    fixture = await createDatasetFixture(generateSampleLeads(SAMPLE_SEED, new Date("2026-06-30T00:00:00Z")));
    conversationId = await createConversationFixture(fixture.datasetId);
  }, 30_000);
  afterAll(async () => { await fixture?.cleanup(); });
  test("all seven tools return well-formed JSON against an owned sample dataset", async () => {
    const { buildAnalystTools } = await import("@/lib/analyst/tools");

    const emitted: string[] = [];
    const cards: unknown[] = [];
    const tools = buildAnalystTools(fixture.datasetId, conversationId, {
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

    const recommendation = {
      type: "review_source", targets: ["Search — High Intent"],
      rationale: "Synthetic integration recommendation", evidence: ["Owned test fixture"],
      confidence: "low", estimatedImpact: { metric: "review coverage", from: "0", to: "1" },
      suggestedNextAction: "Inspect the synthetic source",
    };
    const logged = await call("log_recommended_action", recommendation);
    expect(logged.status).toBe("proposed");
    expect(cards).toEqual([expect.objectContaining({ id: logged.actionId, status: "proposed", card: recommendation })]);
    const [{ db }, { actions }, { eq }] = await Promise.all([import("@/db"), import("@/db/schema"), import("drizzle-orm")]);
    const [stored] = await db.select().from(actions).where(eq(actions.id, logged.actionId));
    expect(stored.datasetId).toBe(fixture.datasetId);
    expect(stored.conversationId).toBe(conversationId);
    expect(stored.rationale).toBe(recommendation.rationale);
    await fixture.cleanup();
    expect(await db.select().from(actions).where(eq(actions.id, logged.actionId))).toEqual([]);

    expect(emitted).toContain("get_dataset_overview");
    expect(emitted).toContain("simulate_budget_shift");
  });
});
