"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartSpec } from "@/lib/types";
import { getColor } from "./chart-colors";
import type { ChartConfig } from "@/components/ui/chart";

export function RadarChartView({ spec }: { spec: ChartSpec }) {
  const { data, xKey, yKeys } = spec;
  if (!xKey || !yKeys?.length) return null;

  const config: ChartConfig = {};
  yKeys.forEach((yk, i) => {
    config[yk.key] = { label: yk.label, color: getColor(i, yk.color) };
  });

  return (
    <ChartContainer config={config} className="min-h-[250px] w-full">
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {yKeys.map((yk, i) => (
          <Radar
            key={yk.key}
            dataKey={yk.key}
            name={yk.label}
            stroke={getColor(i, yk.color)}
            fill={getColor(i, yk.color)}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        ))}
      </RadarChart>
    </ChartContainer>
  );
}
