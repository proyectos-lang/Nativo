"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearDevolucion, enviarAReproceso, resolverRecuperada, resolverPerdida, type ItemDevolucion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RotateCcw, PlusCircle, Wrench, CheckCircle2, XCircle, ListFilter } from "lucide-react";
import { formatoPesos, formatoFecha, type Venta, type VentaDetalle, type Devolucion, type DevolucionDetalle, type DevolucionHistorial, type CuentaBancaria, type InventarioUbicacion } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detallesVenta: Record<number, VentaDetalle[]>;
  devoluciones: Devolucion[];
  detalles: Record<number, DevolucionDetalle[]>;
  historial: Record<number, DevolucionHistorial[]>;
  causales: string[];
  cuentas: CuentaBancaria[];
  ubicaciones: InventarioUbicacion[];
};

type SeleccionLinea = { incluir: boolean; cantidad: number; causal: string; observacion: string; recuperable: boolean };

function SelectorCuenta({ cuentas, valor, onCambio }: { cuentas: CuentaBancaria[]; valor: number; onCambio: (id: number) => void }) {
  return (
    <Select value={valor ? String(valor) : ""} onValueChange={v => v && onCambio(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione cuenta..." /></SelectTrigger>
      <SelectContent>
        {cuentas.map(c => (
          <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const BADGE_ESTADO: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  Pendiente: "outline",
  "En Reproceso": "secondary",
  Recuperada: "default",
  Perdida: "destructive",
};

const ESTADOS_DEVOLUCION = ["Pendiente", "En Reproceso", "Recuperada", "Perdida"];

export function DevolucionesCliente({ ventas, detallesVenta, devoluciones, detalles, historial, causales, cuentas, ubicaciones }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstados, setFiltroEstados] = useState<string[]>([]);

  const nombreCliente = (ventaId: number) => ventas.find(v => v.id === ventaId)?.clientes?.nombre || "-";
  const ticketDe = (ventaId: number) => ventas.find(v => v.id === ventaId)?.ticket;

  const toggleFiltroEstado = (estado: string) => {
    setFiltroEstados(prev => prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]);
  };

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return devoluciones.filter(d => {
      if (q) {
        const ticket = String(ticketDe(d.venta_id) ?? "");
        if (!ticket.includes(q) && !nombreCliente(d.venta_id).toLowerCase().includes(q)) return false;
      }
      if (filtroEstados.length > 0) {
        const dets = detalles[d.id] || [];
        if (!dets.some(det => filtroEstados.includes(det.estado))) return false;
      }
      return true;
    });
  }, [devoluciones, busqueda, filtroEstados, detalles]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumenEstado = (dets: DevolucionDetalle[]) => {
    const total = dets.length;
    const recuperadas = dets.filter(d => d.estado === "Recuperada").length;
    const perdidas = dets.filter(d => d.estado === "Perdida").length;
    const pendientes = total - recuperadas - perdidas;
    if (pendientes > 0) return { texto: `${pendientes} pendiente${pendientes > 1 ? "s" : ""}`, variante: "outline" as const };
    return { texto: `${recuperadas}/${total} recuperada${total > 1 ? "s" : ""}`, variante: "default" as const };
  };

  const correr = (fn: () => Promise<unknown>, exito: string, cerrar?: () => void) => {
    startTransition(async () => {
      try {
        await fn();
        toast.success(exito);
        cerrar?.();
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // ---- Nueva devolución ----
  const [dialogNueva, setDialogNueva] = useState(false);
  const [ventaSel, setVentaSel] = useState<Venta | null>(null);
  const [busquedaVenta, setBusquedaVenta] = useState("");
  const [comentarioNueva, setComentarioNueva] = useState("");
  const [seleccion, setSeleccion] = useState<Record<number, SeleccionLinea>>({});

  const abrirNueva = () => {
    setVentaSel(null);
    setBusquedaVenta("");
    setComentarioNueva("");
    setSeleccion({});
    setDialogNueva(true);
  };

  const selDe = (lineaId: number, linea: VentaDetalle): SeleccionLinea =>
    seleccion[lineaId] || { incluir: false, cantidad: linea.cantidad, causal: "", observacion: "", recuperable: true };

  const actualizarSel = (lineaId: number, linea: VentaDetalle, patch: Partial<SeleccionLinea>) => {
    setSeleccion(prev => ({ ...prev, [lineaId]: { ...selDe(lineaId, linea), ...patch } }));
  };

  const guardarNueva = () => {
    if (!ventaSel) return;
    const items: ItemDevolucion[] = Object.entries(seleccion)
      .filter(([, s]) => s.incluir && Number(s.cantidad) > 0)
      .map(([id, s]) => ({ ventas_detalle_id: Number(id), cantidad_devuelta: Number(s.cantidad), causal: s.causal, observacion: s.observacion, recuperable: s.recuperable }));
    if (!items.length) { toast.error("Selecciona al menos una prenda a devolver."); return; }
    correr(
      () => crearDevolucion({ venta_id: ventaSel.id, comentario: comentarioNueva, items }),
      "Devolución registrada",
      () => setDialogNueva(false),
    );
  };

  // ---- Detalle de una devolución ----
  const [devolucionSel, setDevolucionSel] = useState<Devolucion | null>(null);

  // ---- Enviar/reintentar reproceso ----
  const [dialogReproceso, setDialogReproceso] = useState<DevolucionDetalle | null>(null);
  const [comentarioReproceso, setComentarioReproceso] = useState("");

  // ---- Marcar recuperada ----
  const [dialogRecuperada, setDialogRecuperada] = useState<DevolucionDetalle | null>(null);
  const [formRecuperada, setFormRecuperada] = useState({ costo: 0, tipoGasto: "Costo" as "Gasto" | "Costo", pagarAhora: false, cuentaId: 0, comentario: "", reingresar: false, ubicacionId: 0 });

  // ---- Marcar perdida ----
  const [dialogPerdida, setDialogPerdida] = useState<DevolucionDetalle | null>(null);
  const [pedirCuentaPerdida, setPedirCuentaPerdida] = useState(false);
  const [cuentaPerdida, setCuentaPerdida] = useState(0);
  const [comentarioPerdida, setComentarioPerdida] = useState("");

  const confirmarPerdida = () => {
    if (!dialogPerdida) return;
    startTransition(async () => {
      try {
        await resolverPerdida({
          detalle_id: dialogPerdida.id,
          comentario: comentarioPerdida,
          cuenta_id_reembolso: pedirCuentaPerdida ? (cuentaPerdida || undefined) : undefined,
        });
        toast.success("Prenda marcada como pérdida");
        setDialogPerdida(null);
        router.refresh();
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("selecciona una cuenta")) {
          setPedirCuentaPerdida(true);
          toast.info(msg);
        } else {
          toast.error(msg);
        }
      }
    });
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><RotateCcw className="size-5" /> Devoluciones</h2>
          <p className="text-sm text-muted-foreground">{devoluciones.length} devoluciones registradas.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-64" placeholder="Buscar por ticket o cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <ListFilter className="size-4" /> Estado{filtroEstados.length > 0 ? ` (${filtroEstados.length})` : ""}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ESTADOS_DEVOLUCION.map(estado => (
                <DropdownMenuCheckboxItem
                  key={estado}
                  checked={filtroEstados.includes(estado)}
                  onCheckedChange={() => toggleFiltroEstado(estado)}
                >
                  {estado}
                </DropdownMenuCheckboxItem>
              ))}
              {filtroEstados.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFiltroEstados([])}>Limpiar filtro</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={abrirNueva}><PlusCircle className="size-4" /> Nueva Devolución</Button>
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
                  <TableHead>Fecha</TableHead>
                  <TableHead>Prendas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(d => {
                  const dets = detalles[d.id] || [];
                  const resumen = resumenEstado(dets);
                  return (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => setDevolucionSel(d)}>
                      <TableCell className="font-semibold">#{ticketDe(d.venta_id) ?? "-"}</TableCell>
                      <TableCell>{nombreCliente(d.venta_id)}</TableCell>
                      <TableCell>{formatoFecha(d.fecha)}</TableCell>
                      <TableCell>{dets.length}</TableCell>
                      <TableCell><Badge variant={resumen.variante}>{resumen.texto}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG: NUEVA DEVOLUCIÓN */}
      <Dialog open={dialogNueva} onOpenChange={setDialogNueva}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Nueva Devolución</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Ticket / Venta *</Label>
              <Combobox
                items={ventas}
                itemToStringLabel={(v: Venta | null) => v ? `#${v.ticket} — ${v.clientes?.nombre ?? "Sin cliente"}` : ""}
                value={ventaSel}
                onValueChange={v => { setVentaSel((v as Venta) ?? null); setSeleccion({}); }}
                inputValue={busquedaVenta}
                onInputValueChange={v => setBusquedaVenta(v ?? "")}
                openOnInputClick
              >
                <ComboboxInput placeholder="Buscar por ticket o cliente..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>No se encontró ningún ticket.</ComboboxEmpty>
                  <ComboboxList>
                    {(v: Venta) => (
                      <ComboboxItem key={v.id} value={v}>
                        <span className="font-medium">#{v.ticket}</span> — {v.clientes?.nombre ?? "Sin cliente"}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            {ventaSel && (
              <div className="grid gap-2">
                <p className="text-sm font-semibold">Prendas del pedido</p>
                {(detallesVenta[ventaSel.id] || []).map(l => {
                  const sel = selDe(l.id, l);
                  return (
                    <div key={l.id} className="grid gap-2 rounded-md border p-3">
                      <label className="flex items-center gap-2">
                        <Checkbox checked={sel.incluir} onCheckedChange={v => actualizarSel(l.id, l, { incluir: !!v })} />
                        <span className="font-medium">{l.producto}</span>
                        <span className="text-xs text-muted-foreground">
                          {[l.talla && `Talla ${l.talla}`, l.color].filter(Boolean).join(" · ")} · x{l.cantidad}
                        </span>
                      </label>
                      {sel.incluir && (
                        <div className="grid grid-cols-3 gap-2 pl-6">
                          <div className="grid gap-1">
                            <Label className="text-xs">Cantidad</Label>
                            <Input type="number" min={1} max={l.cantidad} value={sel.cantidad}
                              onChange={e => actualizarSel(l.id, l, { cantidad: Number(e.target.value) })} />
                          </div>
                          <div className="col-span-2 grid gap-1">
                            <Label className="text-xs">Causal</Label>
                            <Combo opciones={causales} value={sel.causal} onChange={v => actualizarSel(l.id, l, { causal: v })} />
                          </div>
                          <div className="col-span-3 grid gap-1">
                            <Label className="text-xs">Observación (motivo detallado)</Label>
                            <Textarea rows={2} value={sel.observacion} onChange={e => actualizarSel(l.id, l, { observacion: e.target.value })}
                              placeholder="Ej. El bordado quedó corrido 2cm hacia la manga izquierda" />
                          </div>
                          <label className="col-span-3 flex items-center gap-2 text-sm">
                            <Switch checked={sel.recuperable} onCheckedChange={v => actualizarSel(l.id, l, { recuperable: v })} />
                            Recuperable (entra a reproceso)
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!(detallesVenta[ventaSel.id] || []).length && <p className="text-sm text-muted-foreground">Este pedido no tiene líneas registradas.</p>}
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Comentario general</Label>
              <Textarea rows={2} value={comentarioNueva} onChange={e => setComentarioNueva(e.target.value)} placeholder="Notas sobre la devolución..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNueva(false)}>Cancelar</Button>
            <Button onClick={guardarNueva} disabled={pendiente || !ventaSel}>Registrar Devolución</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: DETALLE DE DEVOLUCIÓN */}
      <Dialog open={!!devolucionSel} onOpenChange={o => !o && setDevolucionSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Devolución — Ticket #{devolucionSel ? ticketDe(devolucionSel.venta_id) : ""} · {devolucionSel ? nombreCliente(devolucionSel.venta_id) : ""}</DialogTitle>
          </DialogHeader>
          {devolucionSel && (
            <div className="grid gap-3">
              {devolucionSel.comentario && <p className="text-sm text-muted-foreground">Comentario: {devolucionSel.comentario}</p>}
              {(detalles[devolucionSel.id] || []).map(det => (
                <div key={det.id} className="grid gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {det.producto} <span className="text-xs text-muted-foreground">x{det.cantidad_devuelta}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[det.talla && `Talla ${det.talla}`, det.color, det.causal].filter(Boolean).join(" · ") || "Sin causal"}
                      </p>
                      {det.observacion && <p className="text-xs">{det.observacion}</p>}
                    </div>
                    <Badge variant={BADGE_ESTADO[det.estado] || "outline"}>{det.estado}</Badge>
                  </div>

                  {det.estado === "Recuperada" && det.costo_recuperacion != null && (
                    <p className="text-xs text-muted-foreground">Costo de recuperación: {formatoPesos(det.costo_recuperacion)}</p>
                  )}
                  {det.estado === "Perdida" && det.valor_perdido != null && (
                    <p className="text-xs text-destructive">Valor descontado de la venta: {formatoPesos(det.valor_perdido)}</p>
                  )}

                  {(historial[det.id] || []).length > 0 && (
                    <ol className="relative ml-3 grid gap-2 border-l pl-4 text-sm">
                      {[...(historial[det.id] || [])].reverse().map(h => (
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
                  )}

                  <div className="flex flex-wrap gap-2">
                    {det.estado === "Pendiente" && det.recuperable && (
                      <Button size="sm" onClick={() => { setDialogReproceso(det); setComentarioReproceso(""); }}>
                        <Wrench className="size-4" /> Enviar a Reproceso
                      </Button>
                    )}
                    {det.estado === "Pendiente" && !det.recuperable && (
                      <Button size="sm" variant="destructive" onClick={() => { setDialogPerdida(det); setPedirCuentaPerdida(false); setCuentaPerdida(0); setComentarioPerdida(""); }}>
                        <XCircle className="size-4" /> Marcar Perdida
                      </Button>
                    )}
                    {det.estado === "En Reproceso" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setDialogReproceso(det); setComentarioReproceso(""); }}>
                          <Wrench className="size-4" /> Reintentar Reproceso
                        </Button>
                        <Button size="sm" onClick={() => { setDialogRecuperada(det); setFormRecuperada({ costo: 0, tipoGasto: "Costo", pagarAhora: false, cuentaId: 0, comentario: "", reingresar: false, ubicacionId: 0 }); }}>
                          <CheckCircle2 className="size-4" /> Marcar Recuperada
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setDialogPerdida(det); setPedirCuentaPerdida(false); setCuentaPerdida(0); setComentarioPerdida(""); }}>
                          <XCircle className="size-4" /> Marcar Perdida
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG: ENVIAR/REINTENTAR REPROCESO */}
      <Dialog open={!!dialogReproceso} onOpenChange={o => !o && setDialogReproceso(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{dialogReproceso?.estado === "En Reproceso" ? "Reintentar Reproceso" : "Enviar a Reproceso"}</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label>Comentario</Label>
            <Textarea rows={2} value={comentarioReproceso} onChange={e => setComentarioReproceso(e.target.value)} placeholder="Ej. Se reenvía a bordado por falla en el diseño" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogReproceso(null)}>Cancelar</Button>
            <Button
              disabled={pendiente}
              onClick={() => dialogReproceso && correr(
                () => enviarAReproceso(dialogReproceso.id, comentarioReproceso),
                "Prenda enviada a reproceso",
                () => setDialogReproceso(null),
              )}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: MARCAR RECUPERADA */}
      <Dialog open={!!dialogRecuperada} onOpenChange={o => !o && setDialogRecuperada(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Marcar Prenda como Recuperada</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Costo de recuperación</Label>
              <Input type="number" min={0} value={formRecuperada.costo || ""}
                onChange={e => setFormRecuperada({ ...formRecuperada, costo: Number(e.target.value) })} placeholder="0" />
              <p className="text-xs text-muted-foreground">Si es mayor a $0, se crea un Gasto en Financiero (categoría &quot;Reproceso&quot;).</p>
            </div>
            {formRecuperada.costo > 0 && (
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={formRecuperada.tipoGasto} onValueChange={v => v && setFormRecuperada({ ...formRecuperada, tipoGasto: v as "Gasto" | "Costo" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Costo">Costo</SelectItem>
                    <SelectItem value="Gasto">Gasto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Comentario</Label>
              <Textarea rows={2} value={formRecuperada.comentario} onChange={e => setFormRecuperada({ ...formRecuperada, comentario: e.target.value })} />
            </div>
            {formRecuperada.costo > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={formRecuperada.pagarAhora} onCheckedChange={v => setFormRecuperada({ ...formRecuperada, pagarAhora: v })} />
                  Pagar ahora (salida inmediata de la cuenta)
                </label>
                {formRecuperada.pagarAhora && (
                  <div className="grid gap-1.5">
                    <Label>Cuenta desde donde se paga *</Label>
                    <SelectorCuenta cuentas={cuentas} valor={formRecuperada.cuentaId} onCambio={id => setFormRecuperada({ ...formRecuperada, cuentaId: id })} />
                  </div>
                )}
              </>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={formRecuperada.reingresar} onCheckedChange={v => setFormRecuperada({ ...formRecuperada, reingresar: v })} />
              Reingresar la prenda al inventario
            </label>
            {formRecuperada.reingresar && (
              <div className="grid gap-1.5">
                <Label>Ubicación donde reingresa *</Label>
                <Select value={formRecuperada.ubicacionId ? String(formRecuperada.ubicacionId) : ""} onValueChange={v => v && setFormRecuperada({ ...formRecuperada, ubicacionId: Number(v) })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione ubicación..." /></SelectTrigger>
                  <SelectContent>
                    {ubicaciones.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Requiere que el producto exista en el catálogo de Inventario (mismo nombre).</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRecuperada(null)}>Cancelar</Button>
            <Button
              disabled={pendiente || (formRecuperada.pagarAhora && !formRecuperada.cuentaId) || (formRecuperada.reingresar && !formRecuperada.ubicacionId)}
              onClick={() => dialogRecuperada && correr(
                () => resolverRecuperada({
                  detalle_id: dialogRecuperada.id,
                  costo_recuperacion: formRecuperada.costo,
                  comentario: formRecuperada.comentario,
                  tipo_gasto: formRecuperada.tipoGasto,
                  pagarAhora: formRecuperada.pagarAhora,
                  cuenta_id: formRecuperada.cuentaId || undefined,
                  reingresar_inventario: formRecuperada.reingresar,
                  ubicacion_id: formRecuperada.ubicacionId || undefined,
                }),
                "Prenda marcada como recuperada",
                () => setDialogRecuperada(null),
              )}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: MARCAR PERDIDA */}
      <Dialog open={!!dialogPerdida} onOpenChange={o => !o && setDialogPerdida(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Marcar Prenda como Pérdida</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              El valor de la prenda se restará del total de la venta. Si el cliente ya había pagado de más, se te pedirá una cuenta para reembolsarle.
            </p>
            <div className="grid gap-1.5">
              <Label>Comentario</Label>
              <Textarea rows={2} value={comentarioPerdida} onChange={e => setComentarioPerdida(e.target.value)} />
            </div>
            {pedirCuentaPerdida && (
              <div className="grid gap-1.5">
                <Label>Cuenta desde donde se reembolsa *</Label>
                <SelectorCuenta cuentas={cuentas} valor={cuentaPerdida} onCambio={setCuentaPerdida} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPerdida(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={pendiente || (pedirCuentaPerdida && !cuentaPerdida)} onClick={confirmarPerdida}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
