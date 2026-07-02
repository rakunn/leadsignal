import { asc, eq, sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { agentConversations, agentMessages, datasets, leads } from "@/db/schema";
import {
  ANALYST_MAX_ITERATIONS,
  ANALYST_MAX_TOKENS,
  ANALYST_MODEL,
  ANALYST_THINKING,
  anthropic,
} from "@/lib/anthropic";
import { rollupTotalsByValue } from "@/lib/queries";
import { buildAnalystTools } from "./tools";
import { ANALYST_SYSTEM_PROMPT, datasetContextBlock } from "./system-prompt";

/** App-level SSE events sent to the chat UI. */
export type AnalystEvent =
  | { type: "meta"; conversationId: string }
  | { type: "thinking_delta"; t: string }
  | { type: "text_delta"; t: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_result"; name: string; summary: string }
  | {
      type: "card";
      action: { id: string; status: string; createdAt: string; card: unknown };
    }
  | { type: "done"; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } }
  | { type: "error"; message: string };

export async function runAnalystTurn(opts: {
  datasetId: string;
  conversationId: string | null;
  userMessage: string;
  send: (event: AnalystEvent) => void;
}): Promise<void> {
  const { datasetId, userMessage, send } = opts;

  // Conversation bookkeeping
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(agentConversations)
      .values({
        datasetId,
        title: userMessage.slice(0, 80),
      })
      .returning({ id: agentConversations.id });
    conversationId = conv.id;
  }
  send({ type: "meta", conversationId });

  const history = await db
    .select({ role: agentMessages.role, contentJson: agentMessages.contentJson })
    .from(agentMessages)
    .where(eq(agentMessages.conversationId, conversationId))
    .orderBy(asc(agentMessages.createdAt));

  await db.insert(agentMessages).values({
    conversationId,
    role: "user",
    contentJson: [{ type: "text", text: userMessage }],
  });

  // Volatile dataset context rides on the current user turn (cache-friendly).
  const [[dataset], [range], byCampaign] = await Promise.all([
    db
      .select({ name: datasets.name, rowCount: datasets.rowCount })
      .from(datasets)
      .where(eq(datasets.id, datasetId)),
    db
      .select({
        dateFrom: sql<string | null>`min(${leads.createdAt})::date::text`,
        dateTo: sql<string | null>`max(${leads.createdAt})::date::text`,
      })
      .from(leads)
      .where(eq(leads.datasetId, datasetId)),
    rollupTotalsByValue(datasetId, "campaign"),
  ]);

  const contextBlock = datasetContextBlock({
    name: dataset?.name ?? "dataset",
    rowCount: dataset?.rowCount ?? 0,
    dateFrom: range?.dateFrom ?? null,
    dateTo: range?.dateTo ?? null,
    campaigns: byCampaign
      .sort((a, b) => b.spendCents - a.spendCents)
      .map((c) => c.value),
  });

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({
      role: m.role,
      content: m.contentJson as Anthropic.Beta.BetaContentBlockParam[],
    })),
    { role: "user" as const, content: `${contextBlock}\n\n${userMessage}` },
  ];

  const tools = buildAnalystTools(datasetId, conversationId, {
    toolResult: (name, summary) => send({ type: "tool_result", name, summary }),
    card: (action) =>
      send({ type: "card", action: { ...action, card: action.card } }),
  });

  const runner = anthropic().beta.messages.toolRunner({
    model: ANALYST_MODEL,
    max_tokens: ANALYST_MAX_TOKENS,
    thinking: ANALYST_THINKING,
    system: [
      {
        type: "text",
        text: ANALYST_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
    tools,
    stream: true,
    max_iterations: ANALYST_MAX_ITERATIONS,
  });

  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  const assistantText: string[] = [];

  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          send({ type: "tool_start", name: event.content_block.name });
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          assistantText.push(event.delta.text);
          send({ type: "text_delta", t: event.delta.text });
        } else if (event.delta.type === "thinking_delta") {
          send({ type: "thinking_delta", t: event.delta.thinking });
        }
      }
    }
    const message = await messageStream.finalMessage();
    usage.inputTokens += message.usage.input_tokens;
    usage.outputTokens += message.usage.output_tokens;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    if (assistantText.length > 0) assistantText.push("\n\n");
  }

  const finalText = assistantText.join("").trim();
  await db.insert(agentMessages).values({
    conversationId,
    role: "assistant",
    contentJson: [{ type: "text", text: finalText || "(no text response)" }],
    usageJson: usage,
  });

  send({ type: "done", usage });
}
