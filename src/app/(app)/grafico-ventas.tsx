"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  total: { label: "Ventas", color: "var(--primary)" },
} satisfies ChartConfig;

export function GraficoVentas({ datos }: { datos: { mes: string; total: number }[] }) {
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
          content={<ChartTooltipContent formatter={(value) => "$" + Math.round(Number(value)).toLocaleString("es-CO")} />}
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
