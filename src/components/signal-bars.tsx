import { cn } from "@/lib/utils";

export type SignalBand = "high" | "mid" | "low";

export function bandFromScore(score: number): SignalBand {
  if (score >= 70) return "high";
  if (score >= 40) return "mid";
  return "low";
}

const BAND_CLASSES: Record<SignalBand, string> = {
  high: "bg-signal-high",
  mid: "bg-signal-mid",
  low: "bg-signal-low",
};

const BAR_HEIGHTS = ["h-[35%]", "h-[52%]", "h-[69%]", "h-[86%]", "h-full"];

/**
 * The LeadSignal quality glyph: five ascending bars, filled according to a
 * 0–100 score (one bar per 20 points), colored by quality band.
 */
export function SignalBars({
  score,
  band,
  className,
  barClassName,
}: {
  score: number;
  /** Override the color band (e.g. force suppress-red regardless of score). */
  band?: SignalBand;
  className?: string;
  barClassName?: string;
}) {
  const filled = Math.min(5, Math.max(0, Math.ceil(score / 20)));
  const color = BAND_CLASSES[band ?? bandFromScore(score)];
  return (
    <span
      className={cn("inline-flex h-3.5 items-end gap-px", className)}
      role="img"
      aria-label={`Signal ${score} out of 100`}
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px]",
            h,
            i < filled ? color : "bg-border",
            barClassName,
          )}
        />
      ))}
    </span>
  );
}

/** Brand glyph variant: all bars filled in the brand color. */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex h-4 items-end gap-[2px]", className)}
    >
      {BAR_HEIGHTS.slice(1).map((h, i) => (
        <span key={i} className={cn("w-[3.5px] rounded-[1px] bg-primary", h)} />
      ))}
    </span>
  );
}
