import { z } from "zod";

/**
 * The RecommendationCard contract. This Zod schema IS the input schema of the
 * `log_recommended_action` tool — cards are born as validated tool inputs,
 * persisted to the actions table, and rendered with an Approve button.
 */
export const RecommendationCardSchema = z.object({
  type: z
    .enum([
      "shift_budget",
      "pause_campaign",
      "pause_creative",
      "swap_landing_page",
      "review_source",
    ])
    .describe("The kind of media-buying change being recommended"),
  targets: z
    .array(z.string())
    .min(1)
    .describe("The campaigns / creatives / landing pages this applies to"),
  params: z
    .object({
      from: z.string().optional().describe("Source entity (e.g. campaign to move budget from)"),
      to: z.string().optional().describe("Destination entity"),
      amountUsd: z.number().optional().describe("Budget amount in USD, if applicable"),
      note: z.string().optional(),
    })
    .optional(),
  rationale: z
    .string()
    .describe("One short paragraph: why this change, in media-buyer terms"),
  evidence: z
    .array(z.string())
    .min(1)
    .describe(
      "Metric citations backing the call, e.g. 'Broad Awareness qualified CPL $9.24 vs Search $5.44'",
    ),
  confidence: z.enum(["low", "medium", "high"]),
  estimatedImpact: z.object({
    metric: z.string().describe("The metric this improves, e.g. 'qualified CPL'"),
    from: z.string().describe("Current value, formatted, e.g. '$8.40'"),
    to: z.string().describe("Expected value after the change, e.g. '$5.10'"),
  }),
  suggestedNextAction: z
    .string()
    .describe("The concrete next step a media buyer should take"),
});

export type RecommendationCard = z.infer<typeof RecommendationCardSchema>;

/** What the UI receives for each logged action. */
export interface ActionRecord extends RecommendationCard {
  id: string;
  status: "proposed" | "approved_simulated" | "dismissed";
  createdAt: string;
}
