"use client";

import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RecommendationCard as CardData } from "@/lib/analyst/schemas";
import { cn } from "@/lib/utils";

export const ACTION_TYPE_LABELS: Record<string, string> = {
  shift_budget: "Shift budget",
  pause_campaign: "Pause campaign",
  pause_creative: "Pause creative",
  swap_landing_page: "Swap landing page",
  review_source: "Review source",
};

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-signal-high-soft text-signal-high",
  medium: "bg-signal-mid-soft text-signal-mid",
  low: "bg-secondary text-muted-foreground",
};

export interface CardAction {
  id: string;
  status: string;
  createdAt: string;
  card: CardData;
}

export function RecommendationCardView({
  action,
  onResolved,
}: {
  action: CardAction;
  onResolved?: (status: string) => void;
}) {
  const [status, setStatus] = useState(action.status);
  const [pending, setPending] = useState(false);
  const { card } = action;

  async function resolve(decision: "approve" | "dismiss") {
    setPending(true);
    try {
      const res = await fetch(`/api/analyst/actions/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        toast.error("Couldn't update the action.");
        return;
      }
      const row = (await res.json()) as { status: string };
      setStatus(row.status);
      onResolved?.(row.status);
      if (decision === "approve") {
        toast.success("Approved — change simulated and logged.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-primary text-primary-foreground">
            {ACTION_TYPE_LABELS[card.type] ?? card.type}
          </Badge>
          <span className="text-sm font-medium">{card.targets.join(", ")}</span>
          <Badge
            className={cn(
              "ml-auto border-transparent",
              CONFIDENCE_STYLES[card.confidence],
            )}
          >
            {card.confidence} confidence
          </Badge>
        </div>

        <p className="text-sm">{card.rationale}</p>

        <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">
            {card.estimatedImpact.metric}
          </span>
          <span className="font-mono tabular-nums">{card.estimatedImpact.from}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-mono font-medium tabular-nums text-signal-high">
            {card.estimatedImpact.to}
          </span>
        </div>

        <ul className="space-y-1">
          {card.evidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <span className="text-primary">•</span>
              {e}
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground">
          Next: {card.suggestedNextAction}
        </p>

        {status === "proposed" ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" disabled={pending} onClick={() => resolve("approve")}>
              <Check className="size-3.5" aria-hidden /> Approve (simulate)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => resolve("dismiss")}
            >
              <X className="size-3.5" aria-hidden /> Dismiss
            </Button>
          </div>
        ) : (
          <Badge
            className={cn(
              "border-transparent",
              status === "approved_simulated"
                ? "bg-signal-high-soft text-signal-high"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {status === "approved_simulated" ? "Approved (simulated)" : "Dismissed"}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
