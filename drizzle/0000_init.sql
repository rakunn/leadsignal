CREATE TYPE "public"."action_status" AS ENUM('proposed', 'approved_simulated', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."dataset_source" AS ENUM('upload', 'sample');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('processing', 'scoring', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."lead_segment" AS ENUM('high_value', 'nurture', 'test', 'suppress', 'review');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."rollup_dimension" AS ENUM('campaign', 'ad_set', 'creative', 'platform', 'landing_page');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"conversation_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"rationale" text NOT NULL,
	"estimated_impact" jsonb,
	"confidence" text,
	"status" "action_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"title" text DEFAULT 'New analysis' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content_json" jsonb NOT NULL,
	"usage_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" "dataset_source" NOT NULL,
	"status" "dataset_status" DEFAULT 'processing' NOT NULL,
	"error" text,
	"row_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"scoring_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"lead_external_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"email" text,
	"phone" text,
	"campaign" text NOT NULL,
	"ad_set" text,
	"creative" text,
	"platform" text,
	"landing_page" text,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"email_opened" boolean DEFAULT false NOT NULL,
	"email_clicked" boolean DEFAULT false NOT NULL,
	"sms_clicked" boolean DEFAULT false NOT NULL,
	"converted" boolean DEFAULT false NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"validity_score" integer,
	"intent_score" integer,
	"value_score" integer,
	"composite_score" integer,
	"conversion_probability" real,
	"segment" "lead_segment",
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_breakdown" jsonb,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_of_lead_id" uuid,
	"explanation" text,
	"explanation_model" text,
	"explanation_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"dimension" "rollup_dimension" NOT NULL,
	"dimension_value" text NOT NULL,
	"day" date NOT NULL,
	"lead_count" integer DEFAULT 0 NOT NULL,
	"hq_lead_count" integer DEFAULT 0 NOT NULL,
	"suppress_count" integer DEFAULT 0 NOT NULL,
	"spend_cents" bigint DEFAULT 0 NOT NULL,
	"revenue_cents" bigint DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"score_sum" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollups" ADD CONSTRAINT "rollups_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_dataset_idx" ON "actions" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "agent_messages_conversation_idx" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "leads_dataset_idx" ON "leads" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "leads_dataset_campaign_idx" ON "leads" USING btree ("dataset_id","campaign");--> statement-breakpoint
CREATE INDEX "leads_dataset_segment_idx" ON "leads" USING btree ("dataset_id","segment");--> statement-breakpoint
CREATE INDEX "leads_dataset_score_idx" ON "leads" USING btree ("dataset_id","composite_score");--> statement-breakpoint
CREATE INDEX "leads_dataset_created_idx" ON "leads" USING btree ("dataset_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rollups_unique_idx" ON "rollups" USING btree ("dataset_id","dimension","dimension_value","day");--> statement-breakpoint
CREATE INDEX "rollups_dataset_dim_idx" ON "rollups" USING btree ("dataset_id","dimension");