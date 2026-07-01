import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { datasets } from "@/db/schema";
import { DatasetStatusBadge } from "@/components/dataset-status-badge";
import { UploadCard } from "@/components/upload-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtInt, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DatasetsPage() {
  const list = await db
    .select()
    .from(datasets)
    .orderBy(desc(datasets.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Datasets
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every dataset is scored on ingest — validity, intent, and value per
          lead — then rolled up by campaign, creative, and landing page.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <UploadCard />

        <div className="min-w-0">
          {list.length === 0 ? (
            <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No datasets yet. Upload a lead export to see quality scoring in
              action.
            </div>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dataset</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.status === "ready" ? (
                          <Link
                            href={`/datasets/${d.id}/leads`}
                            className="hover:underline"
                          >
                            {d.name}
                          </Link>
                        ) : (
                          d.name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {d.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {fmtInt(d.rowCount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {d.skippedCount > 0 ? fmtInt(d.skippedCount) : "—"}
                      </TableCell>
                      <TableCell>
                        <DatasetStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {timeAgo(d.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
