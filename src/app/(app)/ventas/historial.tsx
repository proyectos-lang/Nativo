"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actualizarVenta, type LineaVenta } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combo } from "@/components/combo";
import { FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { formatoPesos, formatoFecha, type Venta, type VentaDetalle } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detalles: Record<number, VentaDetalle[]>;
  maestros: Record<string, string[]>;
  productos: string[];
};

export function HistorialVentas({ ventas, detalles, maestros, productos }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cliente, setCliente] = useState("");
  const [producto, setProducto] = useState("");
  const [estado, setEstado] = useState("");

  // Edición
  const [sel, setSel] = useState<Venta | null>(null);
  const [lineasEd, setLineasEd] = useState<LineaVenta[]>([]);
  const [genEd, setGenEd] = useState({ canal_venta: "", campana: "", vendedora: "", profesional: "", motivo_compra: "", fecha_entrega: "" });

  const opcionesClientes = useMemo(
    () => [...new Set(ventas.map(v => v.clientes?.nombre).filter(Boolean))] as string[],
    [ventas]
  );

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
      if (estado && v.estado_entrega !== estado) return [];
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

  const abrirEdicion = (v: Venta) => {
    setSel(v);
    const dets = detalles[v.id] || [];
    setLineasEd(dets.length
      ? dets.map(d => ({
          producto: d.producto, cantidad: Number(d.cantidad) || 1, valor_unitario: Number(d.valor_unitario) || 0,
          talla: d.talla || "", color: d.color || "", sexo: d.sexo || "",
          estampado: d.estampado || "", bordado: d.bordado || "",
          guia_estampado: d.guia_estampado || "", guia_bordado: d.guia_bordado || "",
        }))
      : [{ producto: "", cantidad: 1, valor_unitario: 0 }]);
    setGenEd({
      canal_venta: v.canal_venta || "", campana: v.campana || "", vendedora: v.vendedora || "",
      profesional: v.profesional || "", motivo_compra: v.motivo_compra || "", fecha_entrega: v.fecha_entrega || "",
    });
  };

  const setLineaEd = (i: number, campo: keyof LineaVenta, valor: string | number) => {
    setLineasEd(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const totalEd = useMemo(
    () => lineasEd.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0),
    [lineasEd]
  );

  const guardarEdicion = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await actualizarVenta({ venta_id: sel.id, ...genEd, lineas: lineasEd });
        toast.success(`Venta #${sel.ticket} actualizada`);
        setSel(null);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <Card className="mt-2">
      <CardContent className="grid gap-4 pt-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Cliente / Ticket</Label><Combo opciones={opcionesClientes} value={cliente} onChange={setCliente} placeholder="Buscar..." /></div>
          <div className="grid gap-1.5"><Label>Producto</Label><Combo opciones={productos} value={producto} onChange={setProducto} placeholder="Buscar..." /></div>
          <div className="grid gap-1.5"><Label>Estado</Label><Combo opciones={maestros["estado_entrega"] || []} value={estado} onChange={setEstado} placeholder="Todos" /></div>
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
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
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
                  <TableCell>
                    <Button variant="ghost" size="icon" title="Editar venta" onClick={() => abrirEdicion(v)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{filas.length} línea(s) mostradas.</p>
      </CardContent>

      {/* EDICIÓN DE VENTA */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar Venta #{sel?.ticket} — {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5"><Label>Canal de Venta</Label><Combo opciones={maestros["canal_venta"] || []} value={genEd.canal_venta} onChange={v => setGenEd({ ...genEd, canal_venta: v })} /></div>
                <div className="grid gap-1.5"><Label>Campaña</Label><Combo opciones={maestros["campana"] || []} value={genEd.campana} onChange={v => setGenEd({ ...genEd, campana: v })} /></div>
                <div className="grid gap-1.5"><Label>Vendedora</Label><Combo opciones={maestros["vendedora"] || []} value={genEd.vendedora} onChange={v => setGenEd({ ...genEd, vendedora: v })} /></div>
                <div className="grid gap-1.5"><Label>Profesional</Label><Combo opciones={maestros["profesional"] || []} value={genEd.profesional} onChange={v => setGenEd({ ...genEd, profesional: v })} /></div>
                <div className="grid gap-1.5"><Label>Motivo de Compra</Label><Combo opciones={maestros["motivo_compra"] || []} value={genEd.motivo_compra} onChange={v => setGenEd({ ...genEd, motivo_compra: v })} /></div>
                <div className="grid gap-1.5"><Label>Fecha Entrega</Label><Input type="date" value={genEd.fecha_entrega} onChange={e => setGenEd({ ...genEd, fecha_entrega: e.target.value })} /></div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Productos de la venta</p>
                <Button variant="outline" size="sm" onClick={() => setLineasEd(p => [...p, { producto: "", cantidad: 1, valor_unitario: 0 }])}>
                  <Plus className="size-4" /> Añadir Línea
                </Button>
              </div>

              {lineasEd.map((l, i) => (
                <div key={i} className="relative rounded-lg border border-l-4 border-l-primary p-3">
                  {lineasEd.length > 1 && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-destructive" onClick={() => setLineasEd(prev => prev.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="grid gap-1.5 lg:col-span-2"><Label>Producto *</Label><Combo opciones={productos} value={l.producto} onChange={v => setLineaEd(i, "producto", v)} /></div>
                    <div className="grid gap-1.5"><Label>Cantidad</Label><Input type="number" min={1} value={l.cantidad} onChange={e => setLineaEd(i, "cantidad", Number(e.target.value))} /></div>
                    <div className="grid gap-1.5"><Label>Valor Unitario</Label><Input type="number" min={0} value={l.valor_unitario || ""} onChange={e => setLineaEd(i, "valor_unitario", Number(e.target.value))} placeholder="0" /></div>
                    <div className="grid gap-1.5"><Label>Talla</Label><Combo opciones={maestros["talla"] || []} value={l.talla || ""} onChange={v => setLineaEd(i, "talla", v)} placeholder="N/A" /></div>
                    <div className="grid gap-1.5"><Label>Color</Label><Combo opciones={maestros["color"] || []} value={l.color || ""} onChange={v => setLineaEd(i, "color", v)} placeholder="N/A" /></div>
                    <div className="grid gap-1.5"><Label>Sexo</Label><Combo opciones={maestros["sexo"] || []} value={l.sexo || ""} onChange={v => setLineaEd(i, "sexo", v)} placeholder="N/A" /></div>
                    <div className="grid gap-1.5"><Label>Total Línea</Label><Input readOnly value={formatoPesos((Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0))} className="bg-muted font-semibold" /></div>
                    <div className="grid gap-1.5"><Label>Estampado</Label><Input value={l.estampado || ""} onChange={e => setLineaEd(i, "estampado", e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label>Guía Estampado</Label><Input value={l.guia_estampado || ""} onChange={e => setLineaEd(i, "guia_estampado", e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label>Bordado</Label><Input value={l.bordado || ""} onChange={e => setLineaEd(i, "bordado", e.target.value)} /></div>
                    <div className="grid gap-1.5"><Label>Guía Bordado</Label><Input value={l.guia_bordado || ""} onChange={e => setLineaEd(i, "guia_bordado", e.target.value)} /></div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
                <span>
                  Nuevo total: <span className="font-bold text-primary">{formatoPesos(totalEd)}</span>
                  {" · "}Retención: {formatoPesos(sel.retencion)} · Abonado: {formatoPesos(sel.abono)}
                </span>
                <span>
                  Nuevo saldo:{" "}
                  <span className={`font-bold ${totalEd - sel.retencion - sel.abono > 0 ? "text-destructive" : "text-primary"}`}>
                    {formatoPesos(totalEd - sel.retencion - sel.abono)}
                  </span>
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente}>
              {pendiente ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
