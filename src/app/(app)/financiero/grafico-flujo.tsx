"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  ingresos: { label: "Ingresos", color: "var(--primary)" },
  egresos: { label: "Egresos", color: "oklch(0.577 0.245 27.325)" },
} satisfies ChartConfig;

export function GraficoFlujo({ datos }: { datos: { mes: string; ingresos: number; egresos: number }[] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={datos} margin={{ left: 12 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value, name) => `${name === "ingresos" ? "Ingresos" : "Egresos"}: $${Math.round(Number(value)).toLocaleString("es-CO")}`} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="ingresos" fill="var(--color-ingresos)" radius={[5, 5, 0, 0]} />
        <Bar dataKey="egresos" fill="var(--color-egresos)" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
