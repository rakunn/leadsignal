import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const SEGMENT_LABELS: Record<string, string> = {
  high_value: "High value",
  nurture: "Nurture",
  test: "Test",
  suppress: "Suppress",
  review: "Review",
};

const STYLES: Record<string, string> = {
  high_value: "bg-signal-high-soft text-signal-high border-transparent",
  nurture: "bg-accent text-accent-foreground border-transparent",
  test: "bg-secondary text-muted-foreground border-transparent",
  suppress: "bg-signal-low-soft text-signal-low border-transparent",
  review: "bg-signal-mid-soft text-signal-mid border-transparent",
};

export function SegmentBadge({ segment }: { segment: string | null }) {
  if (!segment) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("font-medium", STYLES[segment])}>
      {SEGMENT_LABELS[segment] ?? segment}
    </Badge>
  );
}
