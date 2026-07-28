"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actualizarFechaEntregaReal } from "./acciones";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ShoppingCart, DollarSign, Truck } from "lucide-react";
import { formatoPesos, formatoFecha, cumplimientoEntrega, type Venta, type Pago, type HistorialEntrega, type VentaDetalle } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  pagos: Record<number, Pago[]>;
  historial: Record<number, HistorialEntrega[]>;
  detalles: Record<number, VentaDetalle[]>;
};

type Evento = { fecha: Date; tipo: "venta" | "pago" | "entrega"; titulo: string; detalle?: string };

const DIAS_ALERTA = 10;

export function SeguimientoCliente({ ventas, pagos, historial, detalles }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("pendientes");
  const [sel, setSel] = useState<Venta | null>(null);
  const [fechaReal, setFechaReal] = useState("");

  const abrirDetalle = (v: Venta) => {
    setSel(v);
    setFechaReal(v.fecha_entrega_real || "");
  };

  const guardarFechaReal = () => {
    if (!sel || !fechaReal) return;
    startTransition(async () => {
      try {
        await actualizarFechaEntregaReal(sel.id, fechaReal);
        toast.success("Fecha real de entrega actualizada");
        setSel(prev => (prev ? { ...prev, fecha_entrega_real: fechaReal } : prev));
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const conDias = useMemo(() => {
    const hoy = Date.now();
    return ventas.map(v => {
      const hist = historial[v.id] || [];
      const ultimaFecha = hist.length
        ? new Date(hist[hist.length - 1].fecha)
        : new Date((v.fecha_entrega || v.fecha) + "T00:00:00");
      const dias = Math.floor((hoy - ultimaFecha.getTime()) / 86400000);
      const entregado = (v.estado_entrega || "").trim().toLowerCase() === "entregado";
      return { venta: v, dias, alerta: !entregado && dias >= DIAS_ALERTA, entregado };
    }).sort((a, b) => b.dias - a.dias);
  }, [ventas, historial]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return conDias.filter(({ venta: v, alerta, entregado }) => {
      if (filtro === "pendientes" && entregado) return false;
      if (filtro === "alerta" && !alerta) return false;
      if (!q) return true;
      return (v.clientes?.nombre || "").toLowerCase().includes(q) ||
        (v.clientes?.empresa || "").toLowerCase().includes(q) ||
        String(v.ticket) === q;
    });
  }, [conDias, busqueda, filtro]);

  const eventos = useMemo<Evento[]>(() => {
    if (!sel) return [];
    const evs: Evento[] = [
      {
        fecha: new Date(sel.fecha + "T00:00:00"),
        tipo: "venta",
        titulo: `Venta registrada — ${formatoPesos(sel.total_compra)}`,
        detalle: (detalles[sel.id] || []).map(d => `${d.producto} x${d.cantidad}`).join(", "),
      },
      ...(pagos[sel.id] || []).map(p => ({
        fecha: new Date(p.creado_en || p.fecha),
        tipo: "pago" as const,
        titulo: `Pago: ${formatoPesos(p.abono)}${p.retencion > 0 ? ` + retención ${formatoPesos(p.retencion)}` : ""}`,
        detalle: p.comentario || undefined,
      })),
      ...(historial[sel.id] || []).map(h => ({
        fecha: new Date(h.fecha),
        tipo: "entrega" as const,
        titulo: `${h.estado_anterior || "(inicio)"} → ${h.estado_nuevo}`,
        detalle: [h.ubicacion && `Ubicación: ${h.ubicacion}`, h.comentario].filter(Boolean).join(" — ") || undefined,
      })),
    ];
    return evs.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  }, [sel, pagos, historial, detalles]);

  const iconos = { venta: ShoppingCart, pago: DollarSign, entrega: Truck };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Seguimiento de Pedidos</h2>
          <p className="text-sm text-muted-foreground">
            Trazabilidad completa: venta, pagos y estados de entrega. Alerta a partir de {DIAS_ALERTA} días sin movimiento.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Buscar</Label>
            <Input className="w-56" placeholder="Ticket, cliente o empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Mostrar</Label>
            <Select value={filtro} onValueChange={v => setFiltro(v || "pendientes")}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes por entregar</SelectItem>
                <SelectItem value="alerta">Solo con alerta ({DIAS_ALERTA}+ días)</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha Programada</TableHead>
                  <TableHead>Cumplimiento</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(({ venta: v, dias, alerta }) => {
                  const cumplimiento = cumplimientoEntrega(v.fecha_entrega, v.fecha_entrega_real);
                  return (
                    <TableRow
                      key={v.id}
                      className={`cursor-pointer ${alerta ? "bg-destructive/10 hover:bg-destructive/15" : ""}`}
                      onClick={() => abrirDetalle(v)}
                    >
                      <TableCell className="font-semibold">#{v.ticket}</TableCell>
                      <TableCell>
                        {v.clientes?.nombre || "-"}
                        {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                      </TableCell>
                      <TableCell><Badge variant={v.estado_entrega === "Entregado" ? "default" : "outline"}>{v.estado_entrega || "Sin Estado"}</Badge></TableCell>
                      <TableCell className="text-sm">{formatoFecha(v.fecha_entrega)}</TableCell>
                      <TableCell>
                        {cumplimiento && <Badge variant={cumplimiento === "A tiempo" ? "default" : "destructive"}>{cumplimiento}</Badge>}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${alerta ? "text-destructive" : ""}`}>
                        {dias} {alerta && <AlertTriangle className="ml-1 inline size-4" />}
                      </TableCell>
                      <TableCell className={`text-right ${v.saldo > 0 ? "font-semibold text-destructive" : ""}`}>{formatoPesos(v.saldo)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trazabilidad — Ticket #{sel?.ticket} · {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <span>Programada: <strong>{formatoFecha(sel.fecha_entrega)}</strong></span>
              <span className="flex items-center gap-2">
                Real:
                <Input type="date" className="h-8 w-40" value={fechaReal} onChange={e => setFechaReal(e.target.value)} />
                <Button size="sm" variant="outline" onClick={guardarFechaReal} disabled={pendiente || !fechaReal || fechaReal === sel.fecha_entrega_real}>
                  {pendiente ? "Guardando..." : "Guardar"}
                </Button>
              </span>
              {cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real) && (
                <Badge variant={cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real) === "A tiempo" ? "default" : "destructive"}>
                  {cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real)}
                </Badge>
              )}
              {sel.transportadora && <span>Transportadora: <strong>{sel.transportadora}</strong></span>}
              {sel.numero_guia && <span>Guía: <strong>{sel.numero_guia}</strong></span>}
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto">
            <ol className="relative ml-3 grid gap-4 border-l pl-6">
              {eventos.map((e, i) => {
                const Icono = iconos[e.tipo];
                return (
                  <li key={i} className="relative">
                    <span className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Icono className="size-3.5" />
                    </span>
                    <p className="text-sm font-medium">{e.titulo}</p>
                    <p className="text-xs text-muted-foreground">{e.fecha.toLocaleString("es-CO")}</p>
                    {e.detalle && <p className="text-xs">{e.detalle}</p>}
                  </li>
                );
              })}
            </ol>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
