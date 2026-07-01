import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  ready: "bg-signal-high-soft text-signal-high border-transparent",
  processing: "bg-secondary text-secondary-foreground border-transparent",
  scoring: "bg-secondary text-secondary-foreground border-transparent",
  error: "bg-signal-low-soft text-signal-low border-transparent",
};

const LABELS: Record<string, string> = {
  ready: "Ready",
  processing: "Processing",
  scoring: "Scoring",
  error: "Error",
};

export function DatasetStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("font-medium", STYLES[status])}>
      {LABELS[status] ?? status}
    </Badge>
  );
}
