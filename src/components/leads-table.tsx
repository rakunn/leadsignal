"use client";

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SegmentBadge } from "@/components/segment-badge";
import { SignalBars, bandFromScore } from "@/components/signal-bars";
import { fmtPct, fmtUsdFromCents } from "@/lib/format";
import type { ScoreBreakdownItem } from "@/lib/scoring/types";
import { cn } from "@/lib/utils";

export interface LeadRowData {
  id: string;
  email: string | null;
  phone: string | null;
  campaign: string;
  creative: string | null;
  platform: string | null;
  landingPage: string | null;
  costCents: number;
  emailOpened: boolean;
  emailClicked: boolean;
  smsClicked: boolean;
  converted: boolean;
  revenueCents: number;
  validityScore: number | null;
  intentScore: number | null;
  valueScore: number | null;
  compositeScore: number | null;
  conversionProbability: number | null;
  segment: string | null;
  riskFlags: string[];
  scoreBreakdown: ScoreBreakdownItem[] | null;
  isDuplicate: boolean;
  createdAtIso: string;
}

function Engagement({ on }: { on: boolean }) {
  return on ? (
    <Check className="size-3.5 text-signal-high" aria-label="yes" />
  ) : (
    <Minus className="size-3.5 text-border" aria-label="no" />
  );
}

function SubScoreRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn(
            "h-full rounded-full",
            score >= 70
              ? "bg-signal-high"
              : score >= 40
                ? "bg-signal-mid"
                : "bg-signal-low",
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs tabular-nums">
        {score}
      </span>
    </div>
  );
}

export function LeadsTable({
  rows,
  explainSlot,
}: {
  rows: LeadRowData[];
  explainSlot?: (lead: LeadRowData) => React.ReactNode;
}) {
  const [open, setOpen] = useState<LeadRowData | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Signal</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-center">Open / Click / SMS</TableHead>
              <TableHead className="text-right">P(convert)</TableHead>
              <TableHead>Segment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <TableRow
                key={lead.id}
                onClick={() => setOpen(lead)}
                className="cursor-pointer"
              >
                <TableCell>
                  <span className="inline-flex items-center gap-2">
                    <SignalBars
                      score={lead.compositeScore ?? 0}
                      band={
                        lead.segment === "suppress"
                          ? "low"
                          : bandFromScore(lead.compositeScore ?? 0)
                      }
                    />
                    <span className="font-mono text-sm tabular-nums">
                      {lead.compositeScore ?? "—"}
                    </span>
                  </span>
                </TableCell>
                <TableCell>
                  <div className="max-w-56">
                    <p className="truncate text-sm">
                      {lead.email ?? (
                        <span className="text-muted-foreground">no email</span>
                      )}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {lead.phone ?? "no phone"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-48">
                    <p className="truncate text-sm">{lead.campaign}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[lead.platform, lead.landingPage]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {fmtUsdFromCents(lead.costCents)}
                </TableCell>
                <TableCell>
                  <span className="flex items-center justify-center gap-2">
                    <Engagement on={lead.emailOpened} />
                    <Engagement on={lead.emailClicked} />
                    <Engagement on={lead.smsClicked} />
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums">
                  {lead.conversionProbability !== null
                    ? fmtPct(lead.conversionProbability)
                    : "—"}
                </TableCell>
                <TableCell>
                  <SegmentBadge segment={lead.segment} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <SignalBars
                    score={open.compositeScore ?? 0}
                    band={
                      open.segment === "suppress"
                        ? "low"
                        : bandFromScore(open.compositeScore ?? 0)
                    }
                    className="h-5"
                  />
                  <span className="font-mono text-2xl tabular-nums">
                    {open.compositeScore ?? "—"}
                  </span>
                  <SegmentBadge segment={open.segment} />
                </SheetTitle>
                <SheetDescription className="truncate">
                  {open.email ?? open.phone ?? "Anonymous lead"} ·{" "}
                  {open.campaign}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-8">
                <div className="space-y-2">
                  <SubScoreRow label="Validity" score={open.validityScore ?? 0} />
                  <SubScoreRow label="Intent" score={open.intentScore ?? 0} />
                  <SubScoreRow label="Value" score={open.valueScore ?? 0} />
                </div>

                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Cost</dt>
                    <dd className="font-mono tabular-nums">
                      {fmtUsdFromCents(open.costCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      P(convert)
                    </dt>
                    <dd className="font-mono tabular-nums">
                      {open.conversionProbability !== null
                        ? fmtPct(open.conversionProbability, 1)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Revenue</dt>
                    <dd className="font-mono tabular-nums">
                      {fmtUsdFromCents(open.revenueCents)}
                    </dd>
                  </div>
                </dl>

                {open.riskFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {open.riskFlags.map((f) => (
                      <Badge
                        key={f}
                        variant="outline"
                        className="font-mono text-[11px] text-signal-low"
                      >
                        {f}
                      </Badge>
                    ))}
                  </div>
                )}

                {open.scoreBreakdown && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium">
                      Scoring receipt
                    </h3>
                    <div className="divide-y rounded-lg border bg-muted/30 text-sm">
                      {open.scoreBreakdown.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-3 px-3 py-1.5"
                        >
                          <span className="text-xs text-muted-foreground">
                            {item.detail}
                          </span>
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              item.points > 0
                                ? "text-signal-high"
                                : "text-muted-foreground",
                            )}
                          >
                            {item.points > 0 ? `+${item.points}` : "0"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Deterministic rules — every point is accounted for. The
                      AI explains scores; it never invents them.
                    </p>
                  </div>
                )}

                {explainSlot?.(open)}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
