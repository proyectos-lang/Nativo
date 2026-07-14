"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { actualizarVenta, eliminarVenta, type LineaVenta } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combo } from "@/components/combo";
import { SubidaImagen } from "@/components/subida-imagen";
import { FileSpreadsheet, Pencil, Plus, Trash2, ShieldAlert } from "lucide-react";
import { formatoPesos, formatoFecha, cumplimientoEntrega, type Venta, type VentaDetalle, type Pago } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  detalles: Record<number, VentaDetalle[]>;
  pagos: Record<number, Pago[]>;
  maestros: Record<string, string[]>;
  productos: string[];
};

type AccionPin = "editar" | "eliminar" | null;

export function HistorialVentas({ ventas, detalles, pagos, maestros, productos }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cliente, setCliente] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [estado, setEstado] = useState("");

  // Detalle (solo lectura)
  const [sel, setSel] = useState<Venta | null>(null);

  // Confirmación con PIN
  const [accionPin, setAccionPin] = useState<AccionPin>(null);
  const [pin, setPin] = useState("");

  // Edición
  const [edicionAbierta, setEdicionAbierta] = useState(false);
  const [edicionVentaId, setEdicionVentaId] = useState<number | null>(null);
  const [edicionTicket, setEdicionTicket] = useState<number | null>(null);
  const [pinEdicion, setPinEdicion] = useState("");
  const [lineasEd, setLineasEd] = useState<LineaVenta[]>([]);
  const [genEd, setGenEd] = useState({ canal_venta: "", campana: "", vendedora: "", profesional: "", motivo_compra: "", fecha_entrega: "", costo_envio: 0 });

  const opcionesClientes = useMemo(
    () => [...new Set(ventas.map(v => v.clientes?.nombre).filter(Boolean))] as string[],
    [ventas]
  );

  const filas = useMemo(() => {
    const q = cliente.toLowerCase().trim();
    return ventas.filter(v => {
      const nombreCliente = v.clientes?.nombre || "";
      const empresa = v.clientes?.empresa || "";
      if (desde && v.fecha < desde) return false;
      if (hasta && v.fecha > hasta) return false;
      if (q && !nombreCliente.toLowerCase().includes(q) && !empresa.toLowerCase().includes(q) && String(v.ticket) !== q) return false;
      if (estado && v.estado_entrega !== estado) return false;
      if (soloPendientes && v.estado_pago === "Pagado Total" && v.estado_entrega === "Entregado") return false;
      return true;
    });
  }, [ventas, desde, hasta, cliente, estado, soloPendientes]);

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const datos = filas.flatMap(v => {
      const dets = detalles[v.id]?.length ? detalles[v.id] : [null];
      return dets.map(d => ({
        Fecha: v.fecha, Ticket: v.ticket, Cliente: v.clientes?.nombre || "", Empresa: v.clientes?.empresa || "",
        Vendedora: v.vendedora || "", Producto: d?.producto || "", Cantidad: d?.cantidad || "",
        "Valor Unitario": d?.valor_unitario || "", "Total Línea": d?.valor_total || "",
        "Costo Envío": v.costo_envio, "Total Compra": v.total_compra, Saldo: v.saldo,
        "Estado Pago": v.estado_pago || "", "Estado Entrega": v.estado_entrega || "",
        "Fecha Programada": v.fecha_entrega || "", "Fecha Real Entrega": v.fecha_entrega_real || "",
      }));
    });
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "Reporte_Pedidos_Nativo.xlsx");
  };

  const abrirEdicion = (v: Venta) => {
    const dets = detalles[v.id] || [];
    setLineasEd(dets.length
      ? dets.map(d => ({
          producto: d.producto, cantidad: Number(d.cantidad) || 1, valor_unitario: Number(d.valor_unitario) || 0,
          talla: d.talla || "", color: d.color || "", sexo: d.sexo || "",
          estampado: d.estampado || "", bordado: d.bordado || "",
          guia_estampado: d.guia_estampado || "", guia_bordado: d.guia_bordado || "",
          imagen_estampado_url: d.imagen_estampado_url || null, imagen_bordado_url: d.imagen_bordado_url || null,
        }))
      : [{ producto: "", cantidad: 1, valor_unitario: 0 }]);
    setGenEd({
      canal_venta: v.canal_venta || "", campana: v.campana || "", vendedora: v.vendedora || "",
      profesional: v.profesional || "", motivo_compra: v.motivo_compra || "", fecha_entrega: v.fecha_entrega || "",
      costo_envio: Number(v.costo_envio) || 0,
    });
    setEdicionAbierta(true);
  };

  const setLineaEd = (i: number, campo: keyof LineaVenta, valor: string | number | null) => {
    setLineasEd(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const totalEd = useMemo(
    () => lineasEd.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0) + (Number(genEd.costo_envio) || 0),
    [lineasEd, genEd.costo_envio]
  );

  const pedirPin = (accion: AccionPin) => {
    setPin("");
    setAccionPin(accion);
  };

  const confirmarPin = () => {
    if (!sel) return;
    if (accionPin === "editar") {
      const venta = sel;
      const pinCapturado = pin;
      setAccionPin(null);
      setSel(null);
      setEdicionVentaId(venta.id);
      setEdicionTicket(venta.ticket);
      setPinEdicion(pinCapturado);
      abrirEdicion(venta);
      return;
    }
    if (accionPin === "eliminar") {
      startTransition(async () => {
        try {
          await eliminarVenta(sel.id, pin);
          toast.success(`Venta #${sel.ticket} eliminada`);
          setAccionPin(null);
          setSel(null);
          router.refresh();
        } catch (e) { toast.error((e as Error).message); }
      });
    }
  };

  const guardarEdicion = () => {
    if (!edicionVentaId) return;
    startTransition(async () => {
      try {
        await actualizarVenta({ venta_id: edicionVentaId, pin: pinEdicion, ...genEd, lineas: lineasEd });
        toast.success("Venta actualizada");
        setEdicionAbierta(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <Card className="mt-2">
      <CardContent className="grid gap-4 pt-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Cliente / Ticket</Label><Combo opciones={opcionesClientes} value={cliente} onChange={setCliente} placeholder="Buscar..." /></div>
          <div className="grid gap-1.5"><Label>Estado</Label><Combo opciones={maestros["estado_entrega"] || []} value={estado} onChange={setEstado} placeholder="Todos" /></div>
          <div className="grid gap-1.5 content-end">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={soloPendientes} onCheckedChange={setSoloPendientes} />
              Solo pendientes
            </label>
            <p className="text-xs text-muted-foreground">Oculta pedidos pagados y entregados</p>
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
                <TableHead className="text-right">Total Compra</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Est. Pago</TableHead>
                <TableHead>Est. Entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
              )}
              {filas.map(v => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => setSel(v)}>
                  <TableCell>{formatoFecha(v.fecha)}</TableCell>
                  <TableCell className="font-semibold">#{v.ticket}</TableCell>
                  <TableCell>
                    {v.clientes?.nombre || "-"}
                    {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                  </TableCell>
                  <TableCell className="text-right">{formatoPesos(v.total_compra)}</TableCell>
                  <TableCell className={`text-right font-semibold ${v.saldo > 0 ? "text-destructive" : ""}`}>{formatoPesos(v.saldo)}</TableCell>
                  <TableCell><Badge variant={v.estado_pago?.includes("Pagado") ? "default" : "secondary"}>{v.estado_pago || "-"}</Badge></TableCell>
                  <TableCell><Badge variant={v.estado_entrega === "Entregado" ? "default" : "outline"}>{v.estado_entrega || "-"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{filas.length} pedido(s) mostrados. Haz clic en una fila para ver el detalle.</p>
      </CardContent>

      {/* DETALLE DE SOLO LECTURA */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pedido #{sel?.ticket} — {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{formatoFecha(sel.fecha)}</p></div>
                <div><p className="text-muted-foreground">Vendedora</p><p className="font-medium">{sel.vendedora || "-"}</p></div>
                <div><p className="text-muted-foreground">Canal</p><p className="font-medium">{sel.canal_venta || "-"}</p></div>
                <div><p className="text-muted-foreground">Campaña</p><p className="font-medium">{sel.campana || "-"}</p></div>
                <div><p className="text-muted-foreground">Fecha Programada</p><p className="font-medium">{formatoFecha(sel.fecha_entrega)}</p></div>
                <div><p className="text-muted-foreground">Fecha Real Entrega</p><p className="font-medium">{formatoFecha(sel.fecha_entrega_real)}</p></div>
                <div><p className="text-muted-foreground">Transportadora</p><p className="font-medium">{sel.transportadora || "-"}</p></div>
                <div><p className="text-muted-foreground">Número de Guía</p><p className="font-medium">{sel.numero_guia || "-"}</p></div>
              </div>

              {cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real) && (
                <Badge variant={cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real) === "A tiempo" ? "default" : "destructive"} className="w-fit">
                  {cumplimientoEntrega(sel.fecha_entrega, sel.fecha_entrega_real)}
                </Badge>
              )}

              <div>
                <p className="mb-1 text-sm font-semibold">Productos</p>
                <div className="grid gap-2">
                  {(detalles[sel.id] || []).map(d => (
                    <div key={d.id} className="rounded-md border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{d.producto} {d.talla && `· Talla ${d.talla}`} {d.color && `· ${d.color}`}</span>
                        <span>{d.cantidad} x {formatoPesos(d.valor_unitario)} = <strong>{formatoPesos(d.valor_total)}</strong></span>
                      </div>
                      {(d.imagen_estampado_url || d.imagen_bordado_url) && (
                        <div className="mt-2 flex gap-3">
                          {d.imagen_estampado_url && (
                            <div>
                              <p className="text-xs text-muted-foreground">Estampado</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={d.imagen_estampado_url} alt="Estampado" className="h-16 w-16 rounded-md border object-cover" />
                            </div>
                          )}
                          {d.imagen_bordado_url && (
                            <div>
                              <p className="text-xs text-muted-foreground">Bordado</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={d.imagen_bordado_url} alt="Bordado" className="h-16 w-16 rounded-md border object-cover" />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {!(detalles[sel.id] || []).length && <p className="text-sm text-muted-foreground">Sin productos registrados.</p>}
                </div>
              </div>

              {(pagos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Pagos</p>
                  <div className="grid gap-1 text-sm">
                    {pagos[sel.id].map(p => (
                      <div key={p.id} className="flex justify-between">
                        <span>{formatoFecha(p.fecha)} {p.comentario && `— ${p.comentario}`}</span>
                        <span className="font-medium">{formatoPesos(p.abono)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-muted-foreground">Costo Envío</p><p className="font-bold">{formatoPesos(sel.costo_envio)}</p></div>
                <div><p className="text-muted-foreground">Total Compra</p><p className="font-bold">{formatoPesos(sel.total_compra)}</p></div>
                <div><p className="text-muted-foreground">Abonado</p><p className="font-bold">{formatoPesos(sel.abono)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(sel.saldo)}</p></div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlert className="size-3.5" /> Editar o eliminar requiere el PIN de autorización.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => pedirPin("editar")}><Pencil className="size-4" /> Editar</Button>
              <Button variant="destructive" onClick={() => pedirPin("eliminar")}><Trash2 className="size-4" /> Eliminar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CONFIRMACIÓN CON PIN */}
      <Dialog open={!!accionPin} onOpenChange={o => !o && setAccionPin(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{accionPin === "eliminar" ? "Confirmar eliminación" : "Autorizar edición"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {accionPin === "eliminar" && (
              <p className="text-sm text-destructive">
                Esta acción no se puede deshacer. Se eliminará el pedido #{sel?.ticket}, sus pagos y los movimientos bancarios asociados.
              </p>
            )}
            <div className="grid gap-1.5">
              <Label>PIN de autorización</Label>
              <Input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmarPin()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccionPin(null)}>Cancelar</Button>
            <Button variant={accionPin === "eliminar" ? "destructive" : "default"} onClick={confirmarPin} disabled={pendiente || !pin.trim()}>
              {pendiente ? "Procesando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDICIÓN DE VENTA */}
      <Dialog open={edicionAbierta} onOpenChange={setEdicionAbierta}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Editar Venta #{edicionTicket ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label>Canal de Venta</Label><Combo opciones={maestros["canal_venta"] || []} value={genEd.canal_venta} onChange={v => setGenEd({ ...genEd, canal_venta: v })} /></div>
              <div className="grid gap-1.5"><Label>Campaña</Label><Combo opciones={maestros["campana"] || []} value={genEd.campana} onChange={v => setGenEd({ ...genEd, campana: v })} /></div>
              <div className="grid gap-1.5"><Label>Vendedora</Label><Combo opciones={maestros["vendedora"] || []} value={genEd.vendedora} onChange={v => setGenEd({ ...genEd, vendedora: v })} /></div>
              <div className="grid gap-1.5"><Label>Profesional</Label><Combo opciones={maestros["profesional"] || []} value={genEd.profesional} onChange={v => setGenEd({ ...genEd, profesional: v })} /></div>
              <div className="grid gap-1.5"><Label>Motivo de Compra</Label><Combo opciones={maestros["motivo_compra"] || []} value={genEd.motivo_compra} onChange={v => setGenEd({ ...genEd, motivo_compra: v })} /></div>
              <div className="grid gap-1.5"><Label>Fecha Programada</Label><Input type="date" value={genEd.fecha_entrega} onChange={e => setGenEd({ ...genEd, fecha_entrega: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Costo de Envío</Label><Input type="number" min={0} value={genEd.costo_envio || ""} onChange={e => setGenEd({ ...genEd, costo_envio: Number(e.target.value) })} placeholder="0" /></div>
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
                  <SubidaImagen label="Imagen Estampado" url={l.imagen_estampado_url} onChange={url => setLineaEd(i, "imagen_estampado_url", url)} />
                  <SubidaImagen label="Imagen Bordado" url={l.imagen_bordado_url} onChange={url => setLineaEd(i, "imagen_bordado_url", url)} />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
              <span>Nuevo total (incluye envío): <span className="font-bold text-primary">{formatoPesos(totalEd)}</span></span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicionAbierta(false)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente}>
              {pendiente ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
