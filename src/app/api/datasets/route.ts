import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { MAX_UPLOAD_BYTES } from "@/lib/ingest/columns";
import {
  CsvContractError,
  parseCsvLeads,
  runIngest,
} from "@/lib/ingest/parse";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await db
    .select()
    .from(datasets)
    .orderBy(desc(datasets.createdAt));
  return NextResponse.json({ datasets: list });
}

export async function POST(request: Request) {
  let file: File;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json(
        { error: "Attach a CSV file under the 'file' field." },
        { status: 400 },
      );
    }
    file = f;
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 32 MB upload limit." },
      { status: 413 },
    );
  }

  let parsed;
  try {
    parsed = parseCsvLeads(await file.text());
  } catch (err) {
    if (err instanceof CsvContractError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: `No usable rows found. ${parsed.sampleErrors[0] ?? ""}`.trim(),
      },
      { status: 400 },
    );
  }

  const [dataset] = await db
    .insert(datasets)
    .values({
      name: file.name.replace(/\.csv$/i, "") || "Uploaded leads",
      source: "upload",
    })
    .returning();

  // Synchronous by design: Cloud Run only guarantees CPU while a request is
  // open. The client polls /status for progress in parallel.
  await runIngest(dataset.id, parsed);

  return NextResponse.json({ id: dataset.id, rows: parsed.rows.length });
}
