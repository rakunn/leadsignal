"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_PROPS,
  fmtDayShort,
  GRID_STROKE,
  LegendChips,
  TooltipCard,
} from "./chart-chrome";

export interface TrendSeries {
  name: string;
  color: string;
  /** day (ISO date) → hq rate 0–1 */
  points: Record<string, number>;
}

export function QualityTrendChart({
  days,
  series,
  annotation,
}: {
  days: string[];
  series: TrendSeries[];
  annotation?: { day: string; label: string } | null;
}) {
  const data = days.map((day) => {
    const row: Record<string, number | string | null> = { day };
    for (const s of series) row[s.name] = s.points[day] != null ? s.points[day] * 100 : null;
    return row;
  });

  return (
    <div className="space-y-3">
      <LegendChips
        items={series.map((s) => ({ label: s.name.split("—")[0].trim(), color: s.color }))}
      />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="2 4" />
          <XAxis
            dataKey="day"
            {...AXIS_PROPS}
            tickFormatter={fmtDayShort}
            minTickGap={28}
          />
          <YAxis
            {...AXIS_PROPS}
            tickFormatter={(v: number) => `${v}%`}
            width={40}
            domain={[0, "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const rows = payload
                .filter((p) => typeof p.value === "number")
                .sort((a, b) => (b.value as number) - (a.value as number))
                .map((p) => ({
                  color: p.stroke as string,
                  label: String(p.name).split("—")[0].trim(),
                  value: `${(p.value as number).toFixed(0)}%`,
                }));
              return <TooltipCard title={fmtDayShort(String(label))} rows={rows} />;
            }}
          />
          {annotation && (
            <ReferenceLine
              x={annotation.day}
              stroke="var(--signal-low)"
              strokeDasharray="4 4"
              label={{
                value: annotation.label,
                position: "insideTopRight",
                fontSize: 11,
                fill: "var(--signal-low)",
              }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
