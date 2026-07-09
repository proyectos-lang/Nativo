"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet } from "lucide-react";
import { formatoPesos, formatoFecha, type Venta, type VentaDetalle } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detalles: Record<number, VentaDetalle[]>;
  estados: string[];
};

export function HistorialVentas({ ventas, detalles, estados }: Props) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cliente, setCliente] = useState("");
  const [producto, setProducto] = useState("");
  const [estado, setEstado] = useState("todos");

  const filas = useMemo(() => {
    const q = cliente.toLowerCase().trim();
    const qp = producto.toLowerCase().trim();
    return ventas.flatMap(v => {
      const dets = detalles[v.id] || [];
      const nombreCliente = v.clientes?.nombre || "";
      const empresa = v.clientes?.empresa || "";
      if (desde && v.fecha < desde) return [];
      if (hasta && v.fecha > hasta) return [];
      if (q && !nombreCliente.toLowerCase().includes(q) && !empresa.toLowerCase().includes(q) && String(v.ticket) !== q) return [];
      if (estado !== "todos" && v.estado_entrega !== estado) return [];
      const lineas = dets.length ? dets : [null];
      return lineas
        .filter(d => !qp || (d && d.producto.toLowerCase().includes(qp)))
        .map(d => ({ venta: v, detalle: d }));
    });
  }, [ventas, detalles, desde, hasta, cliente, producto, estado]);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const datos = filas.map(({ venta: v, detalle: d }) => ({
      Fecha: v.fecha, Ticket: v.ticket, Cliente: v.clientes?.nombre || "", Empresa: v.clientes?.empresa || "",
      Vendedora: v.vendedora || "", Producto: d?.producto || "", Cantidad: d?.cantidad || "",
      "Valor Unitario": d?.valor_unitario || "", "Total Línea": d?.valor_total || "",
      "Total Compra": v.total_compra, Saldo: v.saldo, "Estado Pago": v.estado_pago || "", "Estado Entrega": v.estado_entrega || "",
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "Reporte_Pedidos_Nativo.xlsx");
  };

  return (
    <Card className="mt-2">
      <CardContent className="grid gap-4 pt-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Cliente / Ticket</Label><Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Buscar..." /></div>
          <div className="grid gap-1.5"><Label>Producto</Label><Input value={producto} onChange={e => setProducto(e.target.value)} placeholder="Buscar..." /></div>
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={v => setEstado(v || "todos")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid content-end">
            <Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="size-4" /> Exportar</Button>
          </div>
        </div>

        <div className="max-h-[560px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Ticket</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Total Compra</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Est. Pago</TableHead>
                <TableHead>Est. Entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
              )}
              {filas.map(({ venta: v, detalle: d }, i) => (
                <TableRow key={`${v.id}-${d?.id ?? i}`}>
                  <TableCell>{formatoFecha(v.fecha)}</TableCell>
                  <TableCell className="font-semibold">#{v.ticket}</TableCell>
                  <TableCell>
                    {v.clientes?.nombre || "-"}
                    {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                  </TableCell>
                  <TableCell>{d?.producto || "-"}</TableCell>
                  <TableCell className="text-right">{d?.cantidad ?? "-"}</TableCell>
                  <TableCell className="text-right">{formatoPesos(v.total_compra)}</TableCell>
                  <TableCell className={`text-right font-semibold ${v.saldo > 0 ? "text-destructive" : ""}`}>{formatoPesos(v.saldo)}</TableCell>
                  <TableCell><Badge variant={v.estado_pago?.includes("Pagado") ? "default" : "secondary"}>{v.estado_pago || "-"}</Badge></TableCell>
                  <TableCell><Badge variant={v.estado_entrega === "Entregado" ? "default" : "outline"}>{v.estado_entrega || "-"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{filas.length} línea(s) mostradas.</p>
      </CardContent>
    </Card>
  );
}
