"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FileDown } from "lucide-react";
import { formatoPesos, type Producto, type InventarioExistencia, type InventarioReserva, type InventarioUbicacion } from "@/lib/tipos";

type MovResumen = {
  tipo: string; producto_id: number | null; producto: string; cantidad: number;
  costo_unitario: number | null; fecha: string; usuario: string | null; motivo: string | null; referencia: string | null;
};

type Props = {
  productos: Producto[];
  existencias: InventarioExistencia[];
  reservas: InventarioReserva[];
  ubicaciones: InventarioUbicacion[];
  movimientosResumen: MovResumen[];
};

type Reporte = {
  columnas: string[];
  filas: (string | number)[][];
  nota?: string;
};

const REPORTES = [
  { clave: "actual", nombre: "Inventario actual" },
  { clave: "valorizado", nombre: "Inventario valorizado por categoría" },
  { clave: "mas_vendidos", nombre: "Productos más vendidos" },
  { clave: "baja_rotacion", nombre: "Baja rotación" },
  { clave: "agotados", nombre: "Productos agotados" },
  { clave: "por_agotarse", nombre: "Próximos a agotarse (≤ mínimo)" },
  { clave: "por_vencer", nombre: "Próximos a vencer" },
  { clave: "rentabilidad", nombre: "Rentabilidad por referencia" },
  { clave: "ajustes", nombre: "Ajustes realizados" },
  { clave: "sin_inventario", nombre: "Ventas sin inventario" },
];

export function ReportesTab({ productos, existencias, reservas, ubicaciones, movimientosResumen }: Props) {
  const [reporte, setReporte] = useState("actual");
  const [diasRotacion, setDiasRotacion] = useState(90);
  const [diasVencer, setDiasVencer] = useState(30);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const datos = useMemo((): Reporte => {
    const inventariados = productos.filter(p => p.controla_inventario);
    const fisicoPorUbicacion = new Map<number, Record<number, number>>();
    for (const e of existencias) {
      if (!fisicoPorUbicacion.has(e.producto_id)) fisicoPorUbicacion.set(e.producto_id, {});
      fisicoPorUbicacion.get(e.producto_id)![e.ubicacion_id] = Number(e.cantidad);
    }
    const stockDe = (id: number) => Object.values(fisicoPorUbicacion.get(id) || {}).reduce((s, c) => s + c, 0);

    const enRango = (fecha: string) => {
      const f = fecha.slice(0, 10);
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      return true;
    };

    switch (reporte) {
      case "actual": {
        return {
          columnas: ["SKU", "Producto", "Categoría", "Talla", "Color", "Sexo", ...ubicaciones.map(u => u.nombre), "Total", "Mín", "Máx"],
          filas: inventariados.map(p => [
            p.sku || "-", p.nombre, p.categoria || "-", p.talla || "-", p.color || "-", p.sexo || "-",
            ...ubicaciones.map(u => fisicoPorUbicacion.get(p.id)?.[u.id] || 0),
            stockDe(p.id), Number(p.stock_minimo), p.stock_maximo != null ? Number(p.stock_maximo) : "∞",
          ]),
        };
      }
      case "valorizado": {
        const porCategoria = new Map<string, { unidades: number; valor: number }>();
        let totalUnidades = 0, totalValor = 0;
        for (const p of inventariados) {
          const stock = stockDe(p.id);
          const valor = stock * Number(p.costo_promedio);
          const cat = p.categoria || "Sin categoría";
          const b = porCategoria.get(cat) || { unidades: 0, valor: 0 };
          b.unidades += stock; b.valor += valor;
          porCategoria.set(cat, b);
          totalUnidades += stock; totalValor += valor;
        }
        return {
          columnas: ["Categoría", "Unidades", "Valor (costo promedio)"],
          filas: [
            ...[...porCategoria.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([cat, v]) => [cat, v.unidades, formatoPesos(v.valor)]),
            ["TOTAL", totalUnidades, formatoPesos(totalValor)],
          ],
        };
      }
      case "mas_vendidos": {
        const porProducto = new Map<string, { unidades: number; costo: number }>();
        for (const m of movimientosResumen) {
          if (m.tipo !== "venta" || !enRango(m.fecha)) continue;
          const b = porProducto.get(m.producto) || { unidades: 0, costo: 0 };
          b.unidades += Math.abs(Number(m.cantidad));
          b.costo += Math.abs(Number(m.cantidad)) * (Number(m.costo_unitario) || 0);
          porProducto.set(m.producto, b);
        }
        return {
          columnas: ["Producto", "Unidades vendidas", "Costo de lo vendido"],
          filas: [...porProducto.entries()].sort((a, b) => b[1].unidades - a[1].unidades)
            .map(([prod, v]) => [prod, v.unidades, formatoPesos(v.costo)]),
          nota: "Solo ventas despachadas del inventario, en el rango de fechas elegido (máx. últimos 12 meses).",
        };
      }
      case "baja_rotacion": {
        const ultimaVenta = new Map<number, string>();
        for (const m of movimientosResumen) {
          if (m.tipo !== "venta" || !m.producto_id) continue;
          const previa = ultimaVenta.get(m.producto_id);
          if (!previa || m.fecha > previa) ultimaVenta.set(m.producto_id, m.fecha);
        }
        const limite = new Date(); limite.setDate(limite.getDate() - diasRotacion);
        const filas = inventariados
          .filter(p => stockDe(p.id) > 0)
          .filter(p => {
            const uv = ultimaVenta.get(p.id);
            return !uv || new Date(uv) < limite;
          })
          .map(p => [
            p.sku || "-", p.nombre, p.categoria || "-", stockDe(p.id),
            formatoPesos(stockDe(p.id) * Number(p.costo_promedio)),
            ultimaVenta.get(p.id) ? new Date(ultimaVenta.get(p.id)!).toLocaleDateString("es-CO") : "Sin ventas (12m)",
          ]);
        return {
          columnas: ["SKU", "Producto", "Categoría", "Stock", "Valor inmovilizado", "Última venta"],
          filas,
          nota: `Productos con stock y sin ventas en los últimos ${diasRotacion} días.`,
        };
      }
      case "agotados": {
        return {
          columnas: ["SKU", "Producto", "Categoría", "Mín", "Pendientes por surtir"],
          filas: inventariados.filter(p => stockDe(p.id) <= 0).map(p => [
            p.sku || "-", p.nombre, p.categoria || "-", Number(p.stock_minimo),
            reservas.filter(r => r.producto_id === p.id && r.estado === "Activa" && Number(r.cantidad_pendiente) > 0)
              .reduce((s, r) => s + Number(r.cantidad_pendiente), 0),
          ]),
        };
      }
      case "por_agotarse": {
        return {
          columnas: ["SKU", "Producto", "Categoría", "Stock", "Mín", "Sugerido comprar (hasta máx)"],
          filas: inventariados
            .filter(p => stockDe(p.id) > 0 && stockDe(p.id) <= Number(p.stock_minimo))
            .map(p => [
              p.sku || "-", p.nombre, p.categoria || "-", stockDe(p.id), Number(p.stock_minimo),
              p.stock_maximo != null ? Math.max(Number(p.stock_maximo) - stockDe(p.id), 0) : "-",
            ]),
        };
      }
      case "por_vencer": {
        const ahora = new Date();
        const limite = new Date(ahora); limite.setDate(limite.getDate() + diasVencer);
        const limiteStr = limite.toISOString().slice(0, 10);
        return {
          columnas: ["SKU", "Producto", "Categoría", "Stock", "Fecha de vencimiento", "Días restantes"],
          filas: inventariados
            .filter(p => p.fecha_vencimiento && p.fecha_vencimiento <= limiteStr && stockDe(p.id) > 0)
            .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""))
            .map(p => [
              p.sku || "-", p.nombre, p.categoria || "-", stockDe(p.id), p.fecha_vencimiento || "-",
              Math.ceil((new Date(p.fecha_vencimiento + "T00:00:00").getTime() - ahora.getTime()) / 86400000),
            ]),
          nota: `Productos con stock que vencen en los próximos ${diasVencer} días (o ya vencidos).`,
        };
      }
      case "rentabilidad": {
        const vendidos = new Map<number, { unidades: number; costo: number }>();
        for (const m of movimientosResumen) {
          if (m.tipo !== "venta" || !m.producto_id || !enRango(m.fecha)) continue;
          const b = vendidos.get(m.producto_id) || { unidades: 0, costo: 0 };
          b.unidades += Math.abs(Number(m.cantidad));
          b.costo += Math.abs(Number(m.cantidad)) * (Number(m.costo_unitario) || 0);
          vendidos.set(m.producto_id, b);
        }
        return {
          columnas: ["SKU", "Producto", "Unidades vendidas", "Costo vendido", "Venta estimada", "Utilidad estimada", "Margen %"],
          filas: [...vendidos.entries()]
            .map(([id, v]) => {
              const p = productos.find(x => x.id === id);
              if (!p) return null;
              const venta = v.unidades * Number(p.precio_venta_antes_iva);
              const utilidad = venta - v.costo;
              const margen = venta > 0 ? (utilidad / venta) * 100 : 0;
              return [p.sku || "-", p.nombre, v.unidades, formatoPesos(v.costo), formatoPesos(venta), formatoPesos(utilidad), `${margen.toFixed(1)}%`];
            })
            .filter((f): f is (string | number)[] => f !== null)
            .sort((a, b) => Number(String(b[2])) - Number(String(a[2]))),
          nota: "Venta estimada = unidades × precio de venta actual (antes de IVA); el costo usa el costo histórico de cada despacho.",
        };
      }
      case "ajustes": {
        return {
          columnas: ["Fecha", "Producto", "Diferencia", "Costo unitario", "Valor", "Motivo", "Referencia", "Usuario"],
          filas: movimientosResumen
            .filter(m => m.tipo === "ajuste" && enRango(m.fecha))
            .sort((a, b) => b.fecha.localeCompare(a.fecha))
            .map(m => [
              new Date(m.fecha).toLocaleString("es-CO"), m.producto,
              Number(m.cantidad) > 0 ? `+${m.cantidad}` : String(m.cantidad),
              formatoPesos(m.costo_unitario || 0),
              formatoPesos(Number(m.cantidad) * (Number(m.costo_unitario) || 0)),
              m.motivo || "-", m.referencia || "-", m.usuario || "-",
            ]),
        };
      }
      case "sin_inventario": {
        const pendientes = reservas.filter(r => r.estado === "Activa" && Number(r.cantidad_pendiente) > 0);
        const surtidas = reservas.filter(r => r.fecha_surtido && Number(r.cantidad_pendiente) === 0);
        const tiempos = surtidas
          .map(r => (new Date(r.fecha_surtido!).getTime() - new Date(r.creado_en).getTime()) / 86400000)
          .filter(d => d > 0);
        const promedio = tiempos.length ? (tiempos.reduce((s, d) => s + d, 0) / tiempos.length).toFixed(1) : "-";
        return {
          columnas: ["Ticket", "Producto", "Cantidad", "Pendiente", "Estado", "Creada", "Surtida", "Despachada"],
          filas: [...pendientes, ...surtidas].map(r => [
            `#${r.ticket}`, r.producto, Number(r.cantidad), Number(r.cantidad_pendiente),
            Number(r.cantidad_pendiente) > 0 ? "Pendiente por surtir" : r.estado,
            new Date(r.creado_en).toLocaleDateString("es-CO"),
            r.fecha_surtido ? new Date(r.fecha_surtido).toLocaleDateString("es-CO") : "-",
            r.fecha_despacho ? new Date(r.fecha_despacho).toLocaleDateString("es-CO") : "-",
          ]),
          nota: `Tiempo promedio para surtir un pedido pendiente: ${promedio} día(s).`,
        };
      }
      default:
        return { columnas: [], filas: [] };
    }
  }, [reporte, productos, existencias, reservas, ubicaciones, movimientosResumen, diasRotacion, diasVencer, desde, hasta]);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const nombre = REPORTES.find(r => r.clave === reporte)?.nombre || "Reporte";
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([datos.columnas, ...datos.filas]), nombre.slice(0, 31));
    XLSX.writeFile(wb, `${nombre.replaceAll(" ", "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const usaRangoFechas = ["mas_vendidos", "rentabilidad", "ajustes"].includes(reporte);

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Reporte</Label>
            <Select value={reporte} onValueChange={v => v && setReporte(v)}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORTES.map(r => <SelectItem key={r.clave} value={r.clave}>{r.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {reporte === "baja_rotacion" && (
            <div className="grid gap-1.5">
              <Label>Sin movimiento en</Label>
              <Select value={String(diasRotacion)} onValueChange={v => v && setDiasRotacion(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[30, 60, 90, 180].map(d => <SelectItem key={d} value={String(d)}>{d} días</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {reporte === "por_vencer" && (
            <div className="grid gap-1.5">
              <Label>Vencen en</Label>
              <Select value={String(diasVencer)} onValueChange={v => v && setDiasVencer(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[30, 60, 90].map(d => <SelectItem key={d} value={String(d)}>{d} días</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {usaRangoFechas && (
            <>
              <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" className="w-38" value={desde} onChange={e => setDesde(e.target.value)} /></div>
              <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" className="w-38" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
            </>
          )}
          <Button variant="outline" onClick={exportar} disabled={!datos.filas.length}><FileDown className="size-4" /> Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[560px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {datos.columnas.map(c => <TableHead key={c}>{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.filas.length === 0 && (
                  <TableRow><TableCell colSpan={Math.max(datos.columnas.length, 1)} className="py-8 text-center text-muted-foreground">Sin datos para este reporte.</TableCell></TableRow>
                )}
                {datos.filas.map((fila, i) => (
                  <TableRow key={i} className={String(fila[0]) === "TOTAL" ? "font-bold" : ""}>
                    {fila.map((celda, j) => <TableCell key={j} className="max-w-56 truncate">{celda}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {datos.nota && <p className="mt-2 text-xs text-muted-foreground">{datos.nota}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{datos.filas.length} fila(s).</p>
        </CardContent>
      </Card>
    </div>
  );
}
