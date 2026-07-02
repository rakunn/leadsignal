"use client";

import { cn } from "@/lib/utils";

/** Shared tooltip card for all Recharts tooltips. */
export function TooltipCard({
  title,
  rows,
}: {
  title?: string;
  rows: Array<{ color?: string; label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {title && <p className="mb-1.5 font-medium text-foreground">{title}</p>}
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && (
                <span
                  className="size-2 rounded-[2px]"
                  style={{ backgroundColor: r.color }}
                />
              )}
              {r.label}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendChips({
  items,
  className,
}: {
  items: Array<{ label: string; color: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

export const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
} as const;

export const GRID_STROKE = "var(--border)";

export function fmtDayShort(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
