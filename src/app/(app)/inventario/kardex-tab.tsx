"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown } from "lucide-react";
import { formatoPesos, NOMBRE_TIPO_MOVIMIENTO_INVENTARIO, type InventarioMovimiento, type InventarioUbicacion } from "@/lib/tipos";

type Props = {
  movimientos: InventarioMovimiento[];
  ubicaciones: InventarioUbicacion[];
};

const BADGE_TIPO: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  inventario_inicial: "secondary",
  entrada: "default",
  devolucion: "default",
  salida: "destructive",
  venta: "destructive",
  traslado_salida: "outline",
  traslado_entrada: "outline",
  ajuste: "secondary",
};

export function KardexTab({ movimientos, ubicaciones }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroUbicacion, setFiltroUbicacion] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return movimientos.filter(m => {
      if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
      if (filtroUbicacion !== "todas" && m.ubicacion_id !== Number(filtroUbicacion)) return false;
      const fecha = m.fecha.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (!q) return true;
      return m.producto.toLowerCase().includes(q) ||
        (m.referencia || "").toLowerCase().includes(q) ||
        (m.usuario || "").toLowerCase().includes(q);
    });
  }, [movimientos, busqueda, filtroTipo, filtroUbicacion, desde, hasta]);

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filas = lista.map(m => ({
      Fecha: new Date(m.fecha).toLocaleString("es-CO"),
      Tipo: NOMBRE_TIPO_MOVIMIENTO_INVENTARIO[m.tipo] || m.tipo,
      Producto: m.producto,
      Ubicacion: m.ubicacion || "",
      Cantidad: m.cantidad,
      "Costo Unitario": m.costo_unitario ?? "",
      "Saldo Despues": m.saldo_despues,
      Referencia: m.referencia || "",
      Lote: m.lote || "",
      Motivo: m.motivo || "",
      Usuario: m.usuario || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Kardex");
    XLSX.writeFile(wb, `Kardex_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Buscar</Label>
            <Input className="w-52" placeholder="Producto, referencia, usuario..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v || "todos")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(NOMBRE_TIPO_MOVIMIENTO_INVENTARIO).map(([valor, etiqueta]) => (
                  <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Ubicación</Label>
            <Select value={filtroUbicacion} onValueChange={v => setFiltroUbicacion(v || "todas")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {ubicaciones.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" className="w-38" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" className="w-38" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <Button variant="outline" onClick={exportar}><FileDown className="size-4" /> Excel</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sin movimientos.</TableCell></TableRow>
                )}
                {lista.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(m.fecha).toLocaleString("es-CO")}</TableCell>
                    <TableCell><Badge variant={BADGE_TIPO[m.tipo] || "outline"}>{NOMBRE_TIPO_MOVIMIENTO_INVENTARIO[m.tipo] || m.tipo}</Badge></TableCell>
                    <TableCell className="max-w-52 truncate font-medium">{m.producto}</TableCell>
                    <TableCell>{m.ubicacion || "-"}</TableCell>
                    <TableCell className={`text-right font-bold ${m.cantidad >= 0 ? "text-primary" : "text-destructive"}`}>
                      {m.cantidad >= 0 ? `+${m.cantidad}` : m.cantidad}
                    </TableCell>
                    <TableCell className="text-right text-xs">{m.costo_unitario != null ? formatoPesos(m.costo_unitario) : "-"}</TableCell>
                    <TableCell className="text-right font-medium">{m.saldo_despues}</TableCell>
                    <TableCell className="max-w-40 truncate text-xs">
                      {m.referencia || "-"}
                      {m.motivo && <span className="block text-muted-foreground">{m.motivo}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{m.usuario || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Se muestran los últimos 500 movimientos. Usa los filtros o exporta a Excel para el detalle.</p>
        </CardContent>
      </Card>
    </div>
  );
}
