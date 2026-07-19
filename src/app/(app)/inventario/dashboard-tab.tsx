"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import { Boxes, PackageX, TriangleAlert, Clock, CalendarX2, DollarSign } from "lucide-react";
import { formatoPesos, type Producto, type InventarioExistencia, type InventarioReserva } from "@/lib/tipos";

type MovResumen = { tipo: string; producto_id: number | null; producto: string; cantidad: number; costo_unitario: number | null; fecha: string };

type Props = {
  productos: Producto[];
  existencias: InventarioExistencia[];
  reservas: InventarioReserva[];
  movimientosResumen: MovResumen[];
};

const configVendidos = { unidades: { label: "Unidades vendidas", color: "var(--primary)" } } satisfies ChartConfig;
const configValor = { valor: { label: "Valor", color: "var(--primary)" } } satisfies ChartConfig;
const configCompraVenta = {
  compras: { label: "Compras", color: "var(--primary)" },
  ventas: { label: "Ventas", color: "oklch(0.577 0.245 27.325)" },
} satisfies ChartConfig;

export function DashboardTab({ productos, existencias, reservas, movimientosResumen }: Props) {
  const datos = useMemo(() => {
    const inventariados = productos.filter(p => p.controla_inventario);
    const fisico: Record<number, number> = {};
    for (const e of existencias) fisico[e.producto_id] = (fisico[e.producto_id] || 0) + Number(e.cantidad);

    const totalUnidades = Object.values(fisico).reduce((s, c) => s + c, 0);
    const valorTotal = inventariados.reduce((s, p) => s + (fisico[p.id] || 0) * Number(p.costo_promedio), 0);
    const agotados = inventariados.filter(p => (fisico[p.id] || 0) <= 0).length;
    const bajoMinimo = inventariados.filter(p => (fisico[p.id] || 0) > 0 && (fisico[p.id] || 0) <= Number(p.stock_minimo)).length;
    const pendientes = reservas.filter(r => Number(r.cantidad_pendiente) > 0).length;

    const hoy = new Date();
    const limiteVencer = new Date(hoy); limiteVencer.setDate(limiteVencer.getDate() + 30);
    const proximosVencer = inventariados.filter(p =>
      p.fecha_vencimiento && p.fecha_vencimiento <= limiteVencer.toISOString().slice(0, 10) && (fisico[p.id] || 0) > 0
    ).length;

    // Más vendidos (unidades, últimos 12 meses)
    const vendidosPorProducto = new Map<string, number>();
    for (const m of movimientosResumen) {
      if (m.tipo !== "venta") continue;
      vendidosPorProducto.set(m.producto, (vendidosPorProducto.get(m.producto) || 0) + Math.abs(Number(m.cantidad)));
    }
    const masVendidos = [...vendidosPorProducto.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([producto, unidades]) => ({ producto: producto.length > 22 ? producto.slice(0, 22) + "…" : producto, unidades }));

    // Valor por categoría
    const valorPorCategoria = new Map<string, number>();
    for (const p of inventariados) {
      const cat = p.categoria || "Sin categoría";
      valorPorCategoria.set(cat, (valorPorCategoria.get(cat) || 0) + (fisico[p.id] || 0) * Number(p.costo_promedio));
    }
    const valorCategorias = [...valorPorCategoria.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor) }));

    // Compras vs ventas por mes (valorizado al costo)
    const porMes = new Map<string, { compras: number; ventas: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      porMes.set(d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }), { compras: 0, ventas: 0 });
    }
    for (const m of movimientosResumen) {
      const d = new Date(m.fecha);
      const clave = d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
      const bucket = porMes.get(clave);
      if (!bucket) continue;
      const valor = Math.abs(Number(m.cantidad)) * (Number(m.costo_unitario) || 0);
      if (m.tipo === "entrada" || m.tipo === "inventario_inicial") bucket.compras += valor;
      if (m.tipo === "venta") bucket.ventas += valor;
    }
    const comprasVsVentas = [...porMes.entries()].map(([mes, v]) => ({ mes, compras: Math.round(v.compras), ventas: Math.round(v.ventas) }));

    const ultimos = [...movimientosResumen].reverse().slice(0, 15);

    return {
      referencias: inventariados.length, totalUnidades, valorTotal, agotados, bajoMinimo, pendientes,
      proximosVencer, masVendidos, valorCategorias, comprasVsVentas, ultimos,
    };
  }, [productos, existencias, reservas, movimientosResumen]);

  const kpis = [
    { titulo: "Referencias", valor: String(datos.referencias), sub: "con control de inventario", icono: Boxes, destructivo: false },
    { titulo: "Unidades", valor: String(datos.totalUnidades), sub: "en existencia", icono: Boxes, destructivo: false },
    { titulo: "Valor del Inventario", valor: formatoPesos(datos.valorTotal), sub: "al costo promedio", icono: DollarSign, destructivo: false },
    { titulo: "Agotados", valor: String(datos.agotados), sub: "referencias en cero", icono: PackageX, destructivo: datos.agotados > 0 },
    { titulo: "Bajo Mínimo", valor: String(datos.bajoMinimo), sub: "se recomienda comprar", icono: TriangleAlert, destructivo: datos.bajoMinimo > 0 },
    { titulo: "Pendientes por Surtir", valor: String(datos.pendientes), sub: "ventas sin inventario", icono: Clock, destructivo: datos.pendientes > 0 },
    { titulo: "Próximos a Vencer", valor: String(datos.proximosVencer), sub: "en los próximos 30 días", icono: CalendarX2, destructivo: datos.proximosVencer > 0 },
  ];

  return (
    <div className="grid gap-4 pt-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(k => (
          <Card key={k.titulo} className="h-full">
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">{k.titulo}</p>
                <k.icono className={`size-4 ${k.destructivo ? "text-destructive" : "text-primary"}`} />
              </div>
              <p className={`text-2xl font-bold ${k.destructivo ? "text-destructive" : ""}`}>{k.valor}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Más vendidos (unidades, últimos 12 meses)</CardTitle></CardHeader>
          <CardContent>
            {datos.masVendidos.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay ventas despachadas del inventario.</p> : (
              <ChartContainer config={configVendidos} className="h-64 w-full">
                <BarChart data={datos.masVendidos} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="producto" tickLine={false} axisLine={false} fontSize={11} width={150} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="unidades" fill="var(--color-unidades)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Valor del inventario por categoría</CardTitle></CardHeader>
          <CardContent>
            {datos.valorCategorias.length === 0 ? <p className="text-sm text-muted-foreground">Sin existencias valorizadas.</p> : (
              <ChartContainer config={configValor} className="h-64 w-full">
                <BarChart data={datos.valorCategorias} margin={{ left: 12 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12}
                    tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatoPesos(Number(value))} />} />
                  <Bar dataKey="valor" fill="var(--color-valor)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Compras vs Ventas del inventario (valorizado al costo, últimos 12 meses)</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={configCompraVenta} className="h-64 w-full">
            <BarChart data={datos.comprasVsVentas} margin={{ left: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12}
                tickFormatter={(v: number) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatoPesos(Number(value))} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="compras" fill="var(--color-compras)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ventas" fill="var(--color-ventas)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
