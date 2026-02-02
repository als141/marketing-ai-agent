"use client";

import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/types";
import { CHART_COLORS, formatNumber } from "./chart-colors";
import type { ChartConfig } from "@/components/ui/chart";

export function PieChartView({ spec }: { spec: ChartSpec }) {
  const { data, nameKey, valueKey, type } = spec;
  if (!nameKey || !valueKey) return null;

  const config: ChartConfig = {};
  data.forEach((item, i) => {
    const name = String(item[nameKey] ?? `item-${i}`);
    config[name] = { label: name, color: CHART_COLORS[i % CHART_COLORS.length] };
  });

  const isDonut = type === "donut";

  return (
    <ChartContainer config={config} className="min-h-[250px] w-full">
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={nameKey}
          cx="50%"
          cy="50%"
          innerRadius={isDonut ? "45%" : 0}
          outerRadius="75%"
          paddingAngle={2}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(1)}%`
          }
          labelLine={{ strokeWidth: 1 }}
          fontSize={11}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [formatNumber(value), ""]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ChartContainer>
  );
}
