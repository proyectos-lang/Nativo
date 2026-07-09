"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actualizarEntrega } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatoPesos, formatoFecha, type Venta, type VentaDetalle, type HistorialEntrega } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detalles: Record<number, VentaDetalle[]>;
  historial: Record<number, HistorialEntrega[]>;
  estados: string[];
};

export function EntregasCliente({ ventas, detalles, historial, estados }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [sel, setSel] = useState<Venta | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [comentario, setComentario] = useState("");

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ventas.filter(v => {
      const entregado = (v.estado_entrega || "").trim().toLowerCase() === "entregado";
      if (filtroEstado === "pendientes" && entregado) return false;
      if (filtroEstado !== "pendientes" && filtroEstado !== "todos" && v.estado_entrega !== filtroEstado) return false;
      if (!q) return true;
      return (v.clientes?.nombre || "").toLowerCase().includes(q) ||
        (v.clientes?.empresa || "").toLowerCase().includes(q) ||
        String(v.ticket) === q;
    });
  }, [ventas, busqueda, filtroEstado]);

  const abrir = (v: Venta) => {
    setSel(v);
    setNuevoEstado(v.estado_entrega || "En Proceso");
    setComentario("");
  };

  const guardar = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await actualizarEntrega({ venta_id: sel.id, estado_nuevo: nuevoEstado, comentario });
        toast.success(`Ticket #${sel.ticket} actualizado a: ${nuevoEstado}`);
        setSel(null);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Entregas</h2>
          <p className="text-sm text-muted-foreground">Selecciona un pedido para actualizar su estado de entrega.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Buscar</Label>
            <Input className="w-56" placeholder="Ticket, cliente o empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Estado</Label>
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "pendientes")}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes por entregar</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Productos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última actualización</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(v => {
                  const hist = historial[v.id] || [];
                  const ultima = hist.length ? hist[hist.length - 1].fecha : null;
                  return (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => abrir(v)}>
                      <TableCell className="font-semibold">#{v.ticket}</TableCell>
                      <TableCell>
                        {v.clientes?.nombre || "-"}
                        {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-sm">
                        {(detalles[v.id] || []).map(d => d.producto).join(", ") || "-"}
                      </TableCell>
                      <TableCell><Badge variant={v.estado_entrega === "Entregado" ? "default" : "outline"}>{v.estado_entrega || "Sin Estado"}</Badge></TableCell>
                      <TableCell className="text-sm">{ultima ? formatoFecha(ultima) : formatoFecha(v.fecha)}</TableCell>
                      <TableCell className="text-right">{formatoPesos(v.total_compra)}</TableCell>
                      <TableCell><Button variant="outline" size="sm">Actualizar</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ticket #{sel?.ticket} — {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div>
                <p className="mb-1 text-sm font-semibold">Productos del pedido</p>
                <div className="grid gap-1 rounded-md border p-2 text-sm">
                  {(detalles[sel.id] || []).map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span>
                        {d.producto}
                        <span className="text-xs text-muted-foreground">
                          {[d.talla && `Talla ${d.talla}`, d.color, d.estampado && "Estampado", d.bordado && "Bordado"].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <Badge variant="secondary">x{d.cantidad}</Badge>
                    </div>
                  ))}
                  {!(detalles[sel.id] || []).length && <span className="text-muted-foreground">Sin detalle registrado.</span>}
                </div>
              </div>

              {(historial[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Historial de estados</p>
                  <div className="max-h-40 overflow-auto rounded-md border p-2">
                    <ol className="relative ml-3 grid gap-2 border-l pl-4 text-sm">
                      {[...historial[sel.id]].reverse().map(h => (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                          <span className="font-medium">{h.estado_anterior || "(inicio)"} → {h.estado_nuevo}</span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(h.fecha).toLocaleString("es-CO")} {h.usuario ? `· ${h.usuario}` : ""}
                          </span>
                          {h.comentario && <span className="block text-xs">{h.comentario}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Nuevo estado</Label>
                  <Select value={nuevoEstado} onValueChange={v => setNuevoEstado(v || "")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Comentario / Notas de envío</Label>
                  <Textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej. Enviado por Servientrega Guía #12345" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente || !nuevoEstado}>
              {pendiente ? "Guardando..." : "Guardar Actualización"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
