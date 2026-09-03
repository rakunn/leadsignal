import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { tryAcquireIngest } from "@/lib/ingest/admission";
import { MAX_REQUEST_BYTES, MAX_UPLOAD_BYTES } from "@/lib/ingest/columns";
import {
  CsvContractError,
  parseCsvLeads,
  runIngest,
} from "@/lib/ingest/parse";
import { readBoundedBody, UploadLimitError } from "@/lib/ingest/request";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await db
    .select()
    .from(datasets)
    .orderBy(desc(datasets.createdAt));
  return NextResponse.json({ datasets: list });
}

export async function POST(request: Request) {
  const release = tryAcquireIngest();
  if (!release) {
    return NextResponse.json(
      { error: "An ingestion is already in progress. Try again shortly." },
      { status: 429, headers: { "Retry-After": "5" } },
    );
  }

  try {
    let file: File;
    try {
      const contentType = request.headers.get("content-type");
      if (!contentType) throw new Error("Missing content type");
      const body = await readBoundedBody(request, MAX_REQUEST_BYTES);
      const bodyBuffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(bodyBuffer).set(body);
      const form = await new Request(request.url, {
        method: request.method,
        headers: { "content-type": contentType },
        body: bodyBuffer,
      }).formData();
      const f = form.get("file");
      if (!(f instanceof File)) {
        return NextResponse.json(
          { error: "Attach a CSV file under the 'file' field." },
          { status: 400 },
        );
      }
      file = f;
    } catch (err) {
      if (err instanceof UploadLimitError) {
        return NextResponse.json(
          { error: "Request exceeds the 34 MB upload limit." },
          { status: 413 },
        );
      }
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

    return NextResponse.json({
      id: dataset.id,
      rows: parsed.rows.length,
      skipped: parsed.skipped,
      sampleErrors: parsed.sampleErrors,
    });
  } finally {
    release();
  }
}
