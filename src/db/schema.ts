import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ScoreBreakdownItem } from "@/lib/scoring/types";

export const datasetSource = pgEnum("dataset_source", ["upload", "sample"]);
export const datasetStatus = pgEnum("dataset_status", [
  "processing",
  "scoring",
  "ready",
  "error",
]);
export const leadSegment = pgEnum("lead_segment", [
  "high_value",
  "nurture",
  "test",
  "suppress",
  "review",
]);
export const rollupDimension = pgEnum("rollup_dimension", [
  "campaign",
  "ad_set",
  "creative",
  "platform",
  "landing_page",
]);
export const actionStatus = pgEnum("action_status", [
  "proposed",
  "approved_simulated",
  "dismissed",
]);
export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const datasets = pgTable("datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  source: datasetSource("source").notNull(),
  status: datasetStatus("status").notNull().default("processing"),
  error: text("error"),
  rowCount: integer("row_count").notNull().default(0),
  processedCount: integer("processed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  scoringVersion: text("scoring_version"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    // Raw CSV columns
    leadExternalId: text("lead_external_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    email: text("email"),
    phone: text("phone"),
    campaign: text("campaign").notNull(),
    adSet: text("ad_set"),
    creative: text("creative"),
    platform: text("platform"),
    landingPage: text("landing_page"),
    costCents: integer("cost_cents").notNull().default(0),
    emailOpened: boolean("email_opened").notNull().default(false),
    emailClicked: boolean("email_clicked").notNull().default(false),
    smsClicked: boolean("sms_clicked").notNull().default(false),
    converted: boolean("converted").notNull().default(false),
    revenueCents: integer("revenue_cents").notNull().default(0),
    // Derived by the scoring pass
    validityScore: integer("validity_score"),
    intentScore: integer("intent_score"),
    valueScore: integer("value_score"),
    compositeScore: integer("composite_score"),
    conversionProbability: real("conversion_probability"),
    segment: leadSegment("segment"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdownItem[]>(),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    duplicateOfLeadId: uuid("duplicate_of_lead_id"),
    // Cached LLM explanation (Haiku)
    explanation: text("explanation"),
    explanationModel: text("explanation_model"),
    explanationAt: timestamp("explanation_at", { withTimezone: true }),
  },
  (t) => [
    index("leads_dataset_idx").on(t.datasetId),
    index("leads_dataset_campaign_idx").on(t.datasetId, t.campaign),
    index("leads_dataset_segment_idx").on(t.datasetId, t.segment),
    index("leads_dataset_score_idx").on(t.datasetId, t.compositeScore),
    index("leads_dataset_created_idx").on(t.datasetId, t.createdAt),
  ],
);

/**
 * Daily-grain aggregates per (dimension, value). Additive measures only —
 * ratios (CPL, qualified CPL, ROAS) are always derived at query time.
 */
export const rollups = pgTable(
  "rollups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    dimension: rollupDimension("dimension").notNull(),
    dimensionValue: text("dimension_value").notNull(),
    day: date("day").notNull(),
    leadCount: integer("lead_count").notNull().default(0),
    hqLeadCount: integer("hq_lead_count").notNull().default(0),
    suppressCount: integer("suppress_count").notNull().default(0),
    spendCents: bigint("spend_cents", { mode: "number" }).notNull().default(0),
    revenueCents: bigint("revenue_cents", { mode: "number" })
      .notNull()
      .default(0),
    conversions: integer("conversions").notNull().default(0),
    scoreSum: bigint("score_sum", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("rollups_unique_idx").on(
      t.datasetId,
      t.dimension,
      t.dimensionValue,
      t.day,
    ),
    index("rollups_dataset_dim_idx").on(t.datasetId, t.dimension),
  ],
);

export const agentConversations = pgTable("agent_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id")
    .notNull()
    .references(() => datasets.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New analysis"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => agentConversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    /** Verbatim Anthropic content blocks (incl. tool_use / tool_result / thinking). */
    contentJson: jsonb("content_json").notNull(),
    usageJson: jsonb("usage_json"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agent_messages_conversation_idx").on(t.conversationId)],
);

/** Simulated media-buying actions proposed by the analyst. Never touches real ad accounts. */
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(
      () => agentConversations.id,
      { onDelete: "set null" },
    ),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    rationale: text("rationale").notNull(),
    estimatedImpact: jsonb("estimated_impact"),
    confidence: text("confidence"),
    status: actionStatus("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("actions_dataset_idx").on(t.datasetId)],
);
