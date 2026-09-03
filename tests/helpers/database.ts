import type { LeadInsertRow } from "@/lib/ingest/parse";

export function assertTestDatabase(): void {
  if (process.env.RUN_DB_TESTS !== "1" || !process.env.DATABASE_URL ||
      !/^\/leadsignal_test_[a-z0-9_]+$/.test(new URL(process.env.DATABASE_URL).pathname)) {
    throw new Error("Database writes require an owned leadsignal_test_ database via npm run test:db.");
  }
}

export async function createDatasetFixture(rows: LeadInsertRow[]) {
  assertTestDatabase();
  const [{ db }, { datasets }, { eq }, { runIngest }] = await Promise.all([
    import("@/db"), import("@/db/schema"), import("drizzle-orm"), import("@/lib/ingest/parse"),
  ]);
  const [dataset] = await db.insert(datasets).values({ name: "Owned integration fixture", source: "sample" }).returning();
  const cleanup = async () => { await db.delete(datasets).where(eq(datasets.id, dataset.id)); };
  try {
    await runIngest(dataset.id, { rows, skipped: 0, sampleErrors: [] });
    return { datasetId: dataset.id, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function createConversationFixture(datasetId: string): Promise<string> {
  assertTestDatabase();
  const [{ db }, { agentConversations }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const [conversation] = await db.insert(agentConversations).values({ datasetId }).returning();
  return conversation.id;
}
