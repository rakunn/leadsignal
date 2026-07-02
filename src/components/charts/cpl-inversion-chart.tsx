"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QUALIFIED_COLOR, RAW_COLOR } from "@/lib/chart-colors";
import {
  AXIS_PROPS,
  GRID_STROKE,
  LegendChips,
  TooltipCard,
} from "./chart-chrome";

export interface CplRow {
  name: string;
  rawCpl: number | null;
  qualifiedCpl: number | null;
}

const usd = (v: number) => `$${v.toFixed(2)}`;

export function CplInversionChart({ data }: { data: CplRow[] }) {
  const rows = data.map((d) => ({
    ...d,
    shortName: d.name.split("—")[0].trim(),
  }));

  return (
    <div className="space-y-3">
      <LegendChips
        items={[
          { label: "Raw CPL (what the ad platform shows)", color: RAW_COLOR },
          {
            label: "Qualified CPL (spend ÷ high-quality leads)",
            color: QUALIFIED_COLOR,
          },
        ]}
      />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={rows} barGap={2} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="2 4" />
          <XAxis dataKey="shortName" {...AXIS_PROPS} interval={0} />
          <YAxis {...AXIS_PROPS} tickFormatter={(v: number) => `$${v}`} width={44} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as CplRow & { shortName: string };
              return (
                <TooltipCard
                  title={row.name}
                  rows={[
                    {
                      color: RAW_COLOR,
                      label: "Raw CPL",
                      value: row.rawCpl !== null ? usd(row.rawCpl) : "—",
                    },
                    {
                      color: QUALIFIED_COLOR,
                      label: "Qualified CPL",
                      value:
                        row.qualifiedCpl !== null ? usd(row.qualifiedCpl) : "no HQ leads",
                    },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="rawCpl" fill={RAW_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="qualifiedCpl" fill={QUALIFIED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList
              dataKey="qualifiedCpl"
              position="top"
              formatter={(v) => (typeof v === "number" ? usd(v) : "")}
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fill: "var(--foreground)",
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
