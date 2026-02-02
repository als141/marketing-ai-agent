"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/types";
import { getColor, formatNumber } from "./chart-colors";
import type { ChartConfig } from "@/components/ui/chart";

export function ScatterChartView({ spec }: { spec: ChartSpec }) {
  const { data, xKey, yKeys } = spec;
  if (!xKey || !yKeys?.length) return null;

  const yKey = yKeys[0];
  const config: ChartConfig = {
    [yKey.key]: { label: yKey.label, color: getColor(0, yKey.color) },
  };

  return (
    <ChartContainer config={config} className="min-h-[250px] w-full">
      <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey={xKey}
          type="number"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatNumber(v)}
          name={xKey}
        />
        <YAxis
          dataKey={yKey.key}
          type="number"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatNumber(v)}
          name={yKey.label}
        />
        <ZAxis range={[40, 400]} />
        <Tooltip
          formatter={(value: number) => formatNumber(value)}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
        />
        <Scatter data={data} fill={getColor(0, yKey.color)} />
      </ScatterChart>
    </ChartContainer>
  );
}
