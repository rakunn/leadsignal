"use client";

import { SEGMENT_COLORS } from "@/lib/chart-colors";
import { SEGMENT_LABELS } from "@/components/segment-badge";
import { LegendChips } from "./chart-chrome";

const ORDER = ["high_value", "nurture", "test", "review", "suppress"] as const;

export interface SegmentMixRow {
  name: string;
  counts: Record<string, number>;
}

/**
 * 100% stacked quality mix per entity. Status colors + always-on % labels
 * (≥8% width) + legend — never color alone.
 */
export function SegmentMix({ rows }: { rows: SegmentMixRow[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((row) => {
          const total = ORDER.reduce((acc, s) => acc + (row.counts[s] ?? 0), 0);
          if (total === 0) return null;
          return (
            <div key={row.name} className="space-y-1">
              <p className="truncate text-xs text-muted-foreground">
                {row.name.split("—")[0].trim()}
              </p>
              <div className="flex h-6 w-full gap-px overflow-hidden rounded-[4px]">
                {ORDER.map((segment) => {
                  const share = (row.counts[segment] ?? 0) / total;
                  if (share === 0) return null;
                  return (
                    <div
                      key={segment}
                      className="flex h-full items-center justify-center"
                      style={{
                        width: `${share * 100}%`,
                        backgroundColor: SEGMENT_COLORS[segment],
                      }}
                      title={`${SEGMENT_LABELS[segment]}: ${(share * 100).toFixed(1)}%`}
                    >
                      {share >= 0.08 && (
                        <span className="font-mono text-[10px] font-medium tabular-nums text-white">
                          {Math.round(share * 100)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <LegendChips
        items={ORDER.map((s) => ({
          label: SEGMENT_LABELS[s],
          color: SEGMENT_COLORS[s],
        }))}
      />
    </div>
  );
}
