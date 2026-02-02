"use client";

import { ChartContainer } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/types";
import { CHART_COLORS, formatNumber } from "./chart-colors";
import type { ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

export function FunnelChartView({ spec }: { spec: ChartSpec }) {
  const { data, nameField, valueField } = spec;
  if (!nameField || !valueField) return null;

  // Sort by value descending for funnel effect
  const sorted = [...data].sort(
    (a, b) => (Number(b[valueField]) || 0) - (Number(a[valueField]) || 0)
  );

  const config: ChartConfig = {};
  sorted.forEach((item, i) => {
    const name = String(item[nameField] ?? `step-${i}`);
    config[name] = { label: name, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  return (
    <ChartContainer config={config} className="min-h-[250px] w-full">
      <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v)} />
        <YAxis type="category" dataKey={nameField} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={75} />
        <Tooltip
          formatter={(value: number) => [formatNumber(value), ""]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Bar dataKey={valueField} radius={[0, 4, 4, 0]}>
          {sorted.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
