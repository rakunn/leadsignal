import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { anthropic, EXPLAIN_MODEL, hasAnthropicCredentials } from "@/lib/anthropic";
import { fmtUsdFromCents } from "@/lib/format";

export const dynamic = "force-dynamic";

const ExplanationSchema = z.object({
  explanation: z
    .string()
    .describe("2-3 plain sentences a media buyer understands"),
  keyFactors: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("The decisive scoring factors, quoted from the receipt"),
});

const SYSTEM = `You explain LeadSignal lead-quality scores to media buyers.
You are given a lead's deterministic scoring receipt. Restate what it means in plain language.
Hard rules: use ONLY numbers that appear in the input — never compute, adjust, or invent any figure. Do not second-guess the score. Keep it tight and concrete.`;

/** Explain a lead's score with Haiku. Cached in the leads row after first call. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.explanation) {
    return NextResponse.json({
      explanation: lead.explanation,
      keyFactors: [],
      cached: true,
      model: lead.explanationModel,
    });
  }

  if (!hasAnthropicCredentials()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }
  if (lead.compositeScore === null) {
    return NextResponse.json(
      { error: "This lead hasn't been scored yet." },
      { status: 409 },
    );
  }

  const input = {
    compositeScore: lead.compositeScore,
    subScores: {
      validity: lead.validityScore,
      intent: lead.intentScore,
      value: lead.valueScore,
    },
    segment: lead.segment,
    conversionProbability: lead.conversionProbability,
    riskFlags: lead.riskFlags,
    cost: fmtUsdFromCents(lead.costCents),
    campaign: lead.campaign,
    landingPage: lead.landingPage,
    engagement: {
      emailOpened: lead.emailOpened,
      emailClicked: lead.emailClicked,
      smsClicked: lead.smsClicked,
    },
    receipt: lead.scoreBreakdown?.map((b) => b.detail) ?? [],
  };

  // Haiku 4.5: no `thinking`, no `effort` — both unsupported on this model.
  const response = await anthropic().messages.parse({
    model: EXPLAIN_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Explain this lead's quality score:\n${JSON.stringify(input, null, 1)}`,
      },
    ],
    output_config: { format: zodOutputFormat(ExplanationSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return NextResponse.json(
      { error: "The model returned an unparseable explanation — try again." },
      { status: 502 },
    );
  }

  await db
    .update(leads)
    .set({
      explanation: parsed.explanation,
      explanationModel: EXPLAIN_MODEL,
      explanationAt: new Date(),
    })
    .where(eq(leads.id, id));

  return NextResponse.json({ ...parsed, cached: false, model: EXPLAIN_MODEL });
}
