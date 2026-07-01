import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { scoreLeads } from "./score";
import type { LeadScore, RawLead } from "./types";

const UPDATE_CHUNK = 500;

/**
 * Score every lead in a dataset and persist the results with bulk
 * UPDATE ... FROM (VALUES ...) statements (one round trip per 500 rows).
 */
export async function scoreDataset(datasetId: string): Promise<void> {
  const rows = await db
    .select({
      id: leads.id,
      createdAt: leads.createdAt,
      email: leads.email,
      phone: leads.phone,
      campaign: leads.campaign,
      adSet: leads.adSet,
      creative: leads.creative,
      platform: leads.platform,
      landingPage: leads.landingPage,
      costCents: leads.costCents,
      emailOpened: leads.emailOpened,
      emailClicked: leads.emailClicked,
      smsClicked: leads.smsClicked,
      converted: leads.converted,
      revenueCents: leads.revenueCents,
    })
    .from(leads)
    .where(eq(leads.datasetId, datasetId))
    .orderBy(asc(leads.createdAt), asc(leads.id));

  if (rows.length === 0) return;

  const rawLeads: RawLead[] = rows.map((r) => ({
    createdAt: r.createdAt,
    email: r.email,
    phone: r.phone,
    campaign: r.campaign,
    adSet: r.adSet,
    creative: r.creative,
    platform: r.platform,
    landingPage: r.landingPage,
    costCents: r.costCents,
    emailOpened: r.emailOpened,
    emailClicked: r.emailClicked,
    smsClicked: r.smsClicked,
    converted: r.converted,
    revenueCents: r.revenueCents,
  }));

  const scores = scoreLeads(rawLeads);

  for (let i = 0; i < rows.length; i += UPDATE_CHUNK) {
    const chunk = scores
      .slice(i, i + UPDATE_CHUNK)
      .map((s, k) => ({ id: rows[i + k].id, score: s }));
    await bulkUpdateScores(chunk, rows);
  }
}

async function bulkUpdateScores(
  chunk: Array<{ id: string; score: LeadScore }>,
  allRows: Array<{ id: string }>,
): Promise<void> {
  const values = sql.join(
    chunk.map(({ id, score }) => {
      const dupId =
        score.duplicateOfIndex !== null
          ? allRows[score.duplicateOfIndex].id
          : null;
      return sql`(${id}::uuid, ${score.validityScore}::int, ${score.intentScore}::int, ${score.valueScore}::int, ${score.compositeScore}::int, ${score.conversionProbability}::real, ${score.segment}::lead_segment, ${JSON.stringify(score.riskFlags)}::jsonb, ${JSON.stringify(score.breakdown)}::jsonb, ${score.isDuplicate}::boolean, ${dupId}::uuid)`;
    }),
    sql`, `,
  );

  await db.execute(sql`
    UPDATE leads AS l SET
      validity_score = v.validity_score,
      intent_score = v.intent_score,
      value_score = v.value_score,
      composite_score = v.composite_score,
      conversion_probability = v.conversion_probability,
      segment = v.segment,
      risk_flags = v.risk_flags,
      score_breakdown = v.score_breakdown,
      is_duplicate = v.is_duplicate,
      duplicate_of_lead_id = v.duplicate_of_lead_id
    FROM (VALUES ${values}) AS v(
      id, validity_score, intent_score, value_score, composite_score,
      conversion_probability, segment, risk_flags, score_breakdown,
      is_duplicate, duplicate_of_lead_id
    )
    WHERE l.id = v.id
  `);
}
