import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { DatasetStatusBadge } from "@/components/dataset-status-badge";
import { DatasetTabs } from "@/components/dataset-tabs";
import { fmtInt } from "@/lib/format";

export default async function DatasetLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const dataset = await db.query.datasets.findFirst({
    where: eq(datasets.id, id),
  });
  if (!dataset) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/datasets"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3" aria-hidden /> All datasets
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
              {dataset.name}
            </h1>
            <DatasetStatusBadge status={dataset.status} />
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {fmtInt(dataset.rowCount)} leads
            </span>
          </div>
        </div>
        <DatasetTabs datasetId={dataset.id} />
      </div>
      {children}
    </div>
  );
}
