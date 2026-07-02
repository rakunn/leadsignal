import { desc, eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { actions } from "@/db/schema";
import { AnalystChat } from "@/components/analyst-chat";
import { ACTION_TYPE_LABELS } from "@/components/recommendation-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAnthropicCredentials } from "@/lib/anthropic";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AnalystPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [credentialed, actionLog] = await Promise.all([
    Promise.resolve(hasAnthropicCredentials()),
    db
      .select()
      .from(actions)
      .where(eq(actions.datasetId, id))
      .orderBy(desc(actions.createdAt))
      .limit(20),
  ]);

  return (
    <div className="space-y-4">
      {!credentialed && (
        <div className="flex items-start gap-3 rounded-lg border border-signal-mid/40 bg-signal-mid-soft px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-mid" aria-hidden />
          <div>
            <p className="font-medium">The analyst needs an Anthropic API key.</p>
            <p className="text-muted-foreground">
              Set <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> in{" "}
              <code className="font-mono text-xs">.env.local</code> (or Secret
              Manager in production) and restart the server.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <AnalystChat datasetId={id} />

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="font-heading text-base">Action log</CardTitle>
            <CardDescription>
              Recommendations you approved or dismissed. All simulated — no ad
              account is ever touched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {actionLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Ask the analyst what to change.
              </p>
            ) : (
              <ul className="space-y-3">
                {actionLog.map((a) => {
                  const payload = a.payload as {
                    targets?: string[];
                  } | null;
                  return (
                    <li key={a.id} className="space-y-1 border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {ACTION_TYPE_LABELS[a.type] ?? a.type}
                        </span>
                        <Badge
                          className={cn(
                            "border-transparent text-[11px]",
                            a.status === "approved_simulated"
                              ? "bg-signal-high-soft text-signal-high"
                              : a.status === "dismissed"
                                ? "bg-secondary text-muted-foreground"
                                : "bg-signal-mid-soft text-signal-mid",
                          )}
                        >
                          {a.status === "approved_simulated"
                            ? "approved"
                            : a.status}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {payload?.targets?.join(", ")}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        {timeAgo(a.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
