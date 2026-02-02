"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/types";
import { getColor, formatNumber } from "./chart-colors";
import type { ChartConfig } from "@/components/ui/chart";

export function LineChartView({ spec }: { spec: ChartSpec }) {
  const { data, xKey, yKeys } = spec;
  if (!xKey || !yKeys?.length) return null;

  const config: ChartConfig = {};
  yKeys.forEach((yk, i) => {
    config[yk.key] = { label: yk.label, color: getColor(i, yk.color) };
  });

  return (
    <ChartContainer config={config} className="min-h-[250px] w-full">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v)} />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatNumber(value),
            config[name]?.label ?? name,
          ]}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {yKeys.map((yk, i) => (
          <Line
            key={yk.key}
            type="monotone"
            dataKey={yk.key}
            name={yk.key}
            stroke={getColor(i, yk.color)}
            strokeWidth={2}
            dot={{ r: 2.5 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
