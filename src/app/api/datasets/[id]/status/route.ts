import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { datasets } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataset = await db.query.datasets.findFirst({
    where: eq(datasets.id, id),
    columns: {
      id: true,
      status: true,
      rowCount: true,
      processedCount: true,
      skippedCount: true,
      error: true,
    },
  });
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  return NextResponse.json(dataset);
}
