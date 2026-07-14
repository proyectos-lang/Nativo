"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actualizarEntrega, marcarLineaLista } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Combo } from "@/components/combo";
import { formatoFecha, cumplimientoEntrega, type Venta, type VentaDetalle, type HistorialEntrega } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detalles: Record<number, VentaDetalle[]>;
  historial: Record<number, HistorialEntrega[]>;
  estados: string[];
  transportadoras: string[];
  talleres: string[];
};

const HOY = () => new Date().toISOString().slice(0, 10);

export function EntregasCliente({ ventas, detalles, historial, estados, transportadoras, talleres }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [, startTransitionLinea] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [sel, setSel] = useState<Venta | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [comentario, setComentario] = useState("");
  const [fechaEntregaReal, setFechaEntregaReal] = useState("");
  const [transportadora, setTransportadora] = useState("");
  const [numeroGuia, setNumeroGuia] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [lineasListo, setLineasListo] = useState<Record<number, boolean>>({});

  const estaLista = (d: VentaDetalle) => lineasListo[d.id] ?? d.listo;

  const progreso = (ventaId: number) => {
    const dets = detalles[ventaId] || [];
    if (!dets.length) return null;
    return { listos: dets.filter(estaLista).length, total: dets.length };
  };

  const toggleLinea = (d: VentaDetalle, ventaId: number) => {
    const nuevoValor = !estaLista(d);
    setLineasListo(prev => ({ ...prev, [d.id]: nuevoValor }));
    startTransitionLinea(async () => {
      try {
        await marcarLineaLista(d.id, ventaId, nuevoValor);
        router.refresh();
      } catch (e) {
        setLineasListo(prev => ({ ...prev, [d.id]: !nuevoValor }));
        toast.error((e as Error).message);
      }
    });
  };

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
    const nuevo = v.estado_entrega || "En Proceso";
    setNuevoEstado(nuevo);
    setComentario("");
    setFechaEntregaReal(v.fecha_entrega_real || (nuevo === "Entregado" ? HOY() : ""));
    setTransportadora(v.transportadora || "");
    setNumeroGuia(v.numero_guia || "");
    setUbicacion(v.ubicacion_actual || "");
  };

  const cambiarEstado = (estado: string) => {
    setNuevoEstado(estado);
    if (estado === "Entregado" && !fechaEntregaReal) setFechaEntregaReal(HOY());
  };

  const guardar = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await actualizarEntrega({
          venta_id: sel.id, estado_nuevo: nuevoEstado, comentario,
          fecha_entrega_real: fechaEntregaReal || undefined,
          transportadora: transportadora || undefined,
          numero_guia: numeroGuia || undefined,
          ubicacion: ubicacion || undefined,
        });
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
                  <TableHead>Ubicación / Taller</TableHead>
                  <TableHead>Fecha Programada</TableHead>
                  <TableHead>Cumplimiento</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(v => {
                  const cumplimiento = cumplimientoEntrega(v.fecha_entrega, v.fecha_entrega_real);
                  const prog = progreso(v.id);
                  return (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => abrir(v)}>
                      <TableCell className="font-semibold">#{v.ticket}</TableCell>
                      <TableCell>
                        {v.clientes?.nombre || "-"}
                        {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                      </TableCell>
                      <TableCell className="max-w-56 text-sm">
                        <span className="block truncate">{(detalles[v.id] || []).map(d => d.producto).join(", ") || "-"}</span>
                        {prog && (
                          <Badge variant={prog.listos === prog.total ? "default" : "secondary"} className="mt-1">
                            {prog.listos}/{prog.total} listos
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><Badge variant={v.estado_entrega === "Entregado" ? "default" : "outline"}>{v.estado_entrega || "Sin Estado"}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.ubicacion_actual || "-"}</TableCell>
                      <TableCell className="text-sm">{formatoFecha(v.fecha_entrega)}</TableCell>
                      <TableCell>
                        {cumplimiento && (
                          <Badge variant={cumplimiento === "A tiempo" ? "default" : "destructive"}>{cumplimiento}</Badge>
                        )}
                      </TableCell>
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
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ticket #{sel?.ticket} — {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div>
                <p className="mb-1 text-sm font-semibold">Productos del pedido</p>
                <div className="grid gap-2">
                  {(detalles[sel.id] || []).map(d => (
                    <div key={d.id} className={`rounded-md border p-2 text-sm ${estaLista(d) ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2">
                          <Checkbox checked={estaLista(d)} onCheckedChange={() => toggleLinea(d, sel.id)} />
                          <span className={estaLista(d) ? "text-muted-foreground line-through" : ""}>
                            {d.producto}
                            <span className="ml-1 text-xs text-muted-foreground no-underline">
                              {[d.talla && `Talla ${d.talla}`, d.color].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <Badge variant={estaLista(d) ? "default" : "outline"}>{estaLista(d) ? "Listo" : "Pendiente"}</Badge>
                          <Badge variant="secondary">x{d.cantidad}</Badge>
                        </div>
                      </div>
                      {(d.estampado || d.guia_estampado || d.imagen_estampado_url || d.bordado || d.guia_bordado || d.imagen_bordado_url) && (
                        <div className="mt-2 flex flex-wrap gap-3">
                          {(d.estampado || d.guia_estampado || d.imagen_estampado_url) && (
                            <div className="rounded-md border border-dashed p-2">
                              <p className="text-xs font-semibold text-muted-foreground">Guía de Estampado</p>
                              {d.estampado && <p className="text-xs">Observaciones: {d.estampado}</p>}
                              {d.guia_estampado && <p className="text-xs text-muted-foreground">Guía: {d.guia_estampado}</p>}
                              {d.imagen_estampado_url ? (
                                d.imagen_estampado_url.toLowerCase().endsWith(".pdf") ? (
                                  <a href={d.imagen_estampado_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-primary underline">Ver PDF</a>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={d.imagen_estampado_url} alt="Guía de Estampado" className="mt-1 h-20 w-20 rounded-md object-cover" />
                                )
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">Sin guía de referencia</p>
                              )}
                            </div>
                          )}
                          {(d.bordado || d.guia_bordado || d.imagen_bordado_url) && (
                            <div className="rounded-md border border-dashed p-2">
                              <p className="text-xs font-semibold text-muted-foreground">Guía de Bordado</p>
                              {d.bordado && <p className="text-xs">Observaciones: {d.bordado}</p>}
                              {d.guia_bordado && <p className="text-xs text-muted-foreground">Guía: {d.guia_bordado}</p>}
                              {d.imagen_bordado_url ? (
                                d.imagen_bordado_url.toLowerCase().endsWith(".pdf") ? (
                                  <a href={d.imagen_bordado_url} target="_blank" rel="noopener noreferrer" className="mt-1 block text-xs text-primary underline">Ver PDF</a>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={d.imagen_bordado_url} alt="Guía de Bordado" className="mt-1 h-20 w-20 rounded-md object-cover" />
                                )
                              ) : (
                                <p className="mt-1 text-xs text-muted-foreground">Sin guía de referencia</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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
                          {h.ubicacion && <span className="block text-xs font-medium">Ubicación: {h.ubicacion}</span>}
                          {h.comentario && <span className="block text-xs">{h.comentario}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}

              <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
                <div><p className="text-muted-foreground">Fecha Programada</p><p className="font-medium">{formatoFecha(sel.fecha_entrega)}</p></div>
                <div><p className="text-muted-foreground">Ubicación / Taller actual</p><p className="font-medium">{sel.ubicacion_actual || "-"}</p></div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Nuevo estado</Label>
                  <Select value={nuevoEstado} onValueChange={v => v && cambiarEstado(v)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Fecha real de entrega</Label>
                  <Input type="date" value={fechaEntregaReal} onChange={e => setFechaEntregaReal(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Transportadora</Label>
                  <Combo opciones={transportadoras} value={transportadora} onChange={setTransportadora} placeholder="Ej. Servientrega" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Número de guía</Label>
                  <Input value={numeroGuia} onChange={e => setNumeroGuia(e.target.value)} placeholder="Ej. 123456789" />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Ubicación / Taller</Label>
                  <Combo opciones={talleres} value={ubicacion} onChange={setUbicacion} placeholder="Ej. Tribey, Bordados JA, Madamis, o motivo si está Sin Procesar (falta tela, faltan botones)..." />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
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
