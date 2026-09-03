import { NextResponse } from "next/server";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { tryAcquireIngest } from "@/lib/ingest/admission";
import { runIngest } from "@/lib/ingest/parse";
import {
  defaultAnchor,
  generateSampleLeads,
  SAMPLE_DATASET_NAME,
  SAMPLE_SEED,
} from "@/lib/sample-data/generate";

export const dynamic = "force-dynamic";

/** Generate the deterministic sample dataset through the real ingest+scoring pipeline. */
export async function POST() {
  const release = tryAcquireIngest();
  if (!release) {
    return NextResponse.json(
      { error: "An ingestion is already in progress. Try again shortly." },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }

  try {
    const rows = generateSampleLeads(SAMPLE_SEED, defaultAnchor());

    const [dataset] = await db
      .insert(datasets)
      .values({ name: SAMPLE_DATASET_NAME, source: "sample" })
      .returning();

    await runIngest(dataset.id, { rows, skipped: 0, sampleErrors: [] });

    return NextResponse.json({ id: dataset.id, rows: rows.length });
  } finally {
    release();
  }
}
