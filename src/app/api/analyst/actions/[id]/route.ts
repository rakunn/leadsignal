import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { actions } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Resolve a proposed action: approve (simulated) or dismiss. Never touches ad accounts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let decision: unknown;
  try {
    ({ decision } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "dismiss") {
    return NextResponse.json(
      { error: "decision must be 'approve' or 'dismiss'" },
      { status: 400 },
    );
  }

  const [row] = await db
    .update(actions)
    .set({
      status: decision === "approve" ? "approved_simulated" : "dismissed",
      resolvedAt: new Date(),
    })
    .where(eq(actions.id, id))
    .returning({ id: actions.id, status: actions.status });

  if (!row) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }
  return NextResponse.json(row);
}
