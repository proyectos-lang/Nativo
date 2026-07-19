"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarOrdenCompra, cambiarEstadoOrden, recibirOrden, type LineaOrdenCompra } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { ClipboardList, Plus, Trash2, Send, PackageCheck, Ban, Pencil } from "lucide-react";
import { formatoPesos, formatoFecha, type OrdenCompra, type OrdenCompraDetalle, type Proveedor, type Producto, type InventarioUbicacion } from "@/lib/tipos";

type Props = {
  ordenes: OrdenCompra[];
  detalles: Record<number, OrdenCompraDetalle[]>;
  proveedores: Proveedor[];
  productos: Producto[];
  ubicaciones: InventarioUbicacion[];
};

type LineaForm = { producto: Producto | null; busqueda: string; cantidad: number; precio_unitario: number };

const HOY = () => new Date().toISOString().slice(0, 10);
const LINEA_VACIA: LineaForm = { producto: null, busqueda: "", cantidad: 1, precio_unitario: 0 };

const BADGE_ESTADO: Record<string, "outline" | "secondary" | "default" | "destructive"> = {
  Borrador: "outline",
  Enviada: "secondary",
  "Recibida Parcial": "secondary",
  Recibida: "default",
  Anulada: "destructive",
};

function SelectorProductoOC({ productos, valor, onCambio, busqueda, setBusqueda }: {
  productos: Producto[];
  valor: Producto | null; onCambio: (p: Producto | null) => void;
  busqueda: string; setBusqueda: (v: string) => void;
}) {
  return (
    <Combobox
      items={productos}
      itemToStringLabel={(p: Producto | null) => p ? `${p.sku ? p.sku + " — " : ""}${p.nombre}` : ""}
      value={valor}
      onValueChange={v => onCambio((v as Producto) ?? null)}
      inputValue={busqueda}
      onInputValueChange={v => setBusqueda(v ?? "")}
      openOnInputClick
    >
      <ComboboxInput placeholder="Buscar producto del inventario..." className="w-full" showClear />
      <ComboboxContent>
        <ComboboxEmpty>Sin resultados. El producto debe existir en Inventario con control de inventario.</ComboboxEmpty>
        <ComboboxList>
          {(p: Producto) => (
            <ComboboxItem key={p.id} value={p}>
              <div className="flex flex-col">
                <span className="font-medium">{p.sku ? `${p.sku} — ` : ""}{p.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {[p.categoria, p.talla && `T. ${p.talla}`, p.color].filter(Boolean).join(" · ")} · Compra: {formatoPesos(p.precio_compra)}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function ComprasCliente({ ordenes, detalles, proveedores, productos, ubicaciones }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activas");

  const inventariables = useMemo(
    () => productos.filter(p => p.controla_inventario && p.estado === "Activo"),
    [productos]
  );

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ordenes.filter(o => {
      if (filtroEstado === "activas" && ["Recibida", "Anulada"].includes(o.estado)) return false;
      if (filtroEstado === "recibidas" && o.estado !== "Recibida") return false;
      if (filtroEstado === "anuladas" && o.estado !== "Anulada") return false;
      if (!q) return true;
      return String(o.numero).includes(q) || (o.proveedor || "").toLowerCase().includes(q);
    });
  }, [ordenes, busqueda, filtroEstado]);

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

  // ---- Form nueva/editar orden ----
  const [dialogForm, setDialogForm] = useState(false);
  const [ordenEditando, setOrdenEditando] = useState<OrdenCompra | null>(null);
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [formOC, setFormOC] = useState({ fecha: HOY(), fecha_esperada: "", observaciones: "" });
  const [lineasForm, setLineasForm] = useState<LineaForm[]>([{ ...LINEA_VACIA }]);

  const totalForm = useMemo(
    () => lineasForm.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0),
    [lineasForm]
  );

  const abrirForm = (orden?: OrdenCompra) => {
    if (orden) {
      setOrdenEditando(orden);
      const prov = proveedores.find(p => p.id === orden.proveedor_id) || null;
      setProveedorSel(prov);
      setBusquedaProveedor(prov?.nombre || orden.proveedor || "");
      setFormOC({ fecha: orden.fecha, fecha_esperada: orden.fecha_esperada || "", observaciones: orden.observaciones || "" });
      setLineasForm((detalles[orden.id] || []).map(d => ({
        producto: productos.find(p => p.id === d.producto_id) || null,
        busqueda: d.producto,
        cantidad: Number(d.cantidad),
        precio_unitario: Number(d.precio_unitario),
      })));
    } else {
      setOrdenEditando(null);
      setProveedorSel(null);
      setBusquedaProveedor("");
      setFormOC({ fecha: HOY(), fecha_esperada: "", observaciones: "" });
      setLineasForm([{ ...LINEA_VACIA }]);
    }
    setDialogForm(true);
  };

  const setLinea = (i: number, patch: Partial<LineaForm>) => {
    setLineasForm(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const guardarForm = () => {
    if (!proveedorSel) { toast.error("Selecciona un proveedor."); return; }
    const lineas: LineaOrdenCompra[] = lineasForm
      .filter(l => l.producto && Number(l.cantidad) > 0)
      .map(l => ({
        producto_id: l.producto!.id,
        producto: `${l.producto!.sku ? l.producto!.sku + " — " : ""}${l.producto!.nombre}`,
        cantidad: Number(l.cantidad),
        precio_unitario: Number(l.precio_unitario) || 0,
      }));
    if (!lineas.length) { toast.error("Agrega al menos un producto con cantidad."); return; }
    correr(
      () => guardarOrdenCompra({
        id: ordenEditando?.id,
        proveedor_id: proveedorSel.id,
        proveedor: proveedorSel.nombre,
        ...formOC,
        lineas,
      }),
      ordenEditando ? "Orden actualizada" : "Orden de compra creada (Borrador)",
      () => setDialogForm(false),
    );
  };

  // ---- Detalle ----
  const [ordenSel, setOrdenSel] = useState<OrdenCompra | null>(null);

  // ---- Anular (PIN) ----
  const [dialogAnular, setDialogAnular] = useState<OrdenCompra | null>(null);
  const [pinAnular, setPinAnular] = useState("");

  // ---- Recepción ----
  const [dialogRecibir, setDialogRecibir] = useState<OrdenCompra | null>(null);
  const [formRecibir, setFormRecibir] = useState({ numero_factura: "", fecha: HOY(), crear_gasto: true });
  const [cantidadesRecibir, setCantidadesRecibir] = useState<Record<number, { cantidad: number; ubicacion_id: number; lote: string }>>({});

  const abrirRecibir = (orden: OrdenCompra) => {
    setDialogRecibir(orden);
    setFormRecibir({ numero_factura: "", fecha: HOY(), crear_gasto: true });
    const idBodega = ubicaciones.find(u => u.nombre === "Bodega")?.id || ubicaciones[0]?.id || 0;
    const iniciales: Record<number, { cantidad: number; ubicacion_id: number; lote: string }> = {};
    for (const d of detalles[orden.id] || []) {
      const pendienteLinea = Number(d.cantidad) - Number(d.cantidad_recibida);
      if (pendienteLinea > 0) iniciales[d.id] = { cantidad: pendienteLinea, ubicacion_id: idBodega, lote: "" };
    }
    setCantidadesRecibir(iniciales);
    setOrdenSel(null);
  };

  const totalRecibir = useMemo(() => {
    if (!dialogRecibir) return 0;
    return (detalles[dialogRecibir.id] || []).reduce((s, d) => {
      const r = cantidadesRecibir[d.id];
      return s + (r ? (Number(r.cantidad) || 0) * Number(d.precio_unitario) : 0);
    }, 0);
  }, [dialogRecibir, detalles, cantidadesRecibir]);

  const confirmarRecepcion = () => {
    if (!dialogRecibir) return;
    const lineas = Object.entries(cantidadesRecibir)
      .filter(([, r]) => Number(r.cantidad) > 0)
      .map(([detalleId, r]) => ({
        detalle_id: Number(detalleId),
        cantidad: Number(r.cantidad),
        ubicacion_id: r.ubicacion_id,
        lote: r.lote || undefined,
      }));
    if (!lineas.length) { toast.error("Indica al menos una cantidad a recibir."); return; }
    correr(
      () => recibirOrden({ orden_id: dialogRecibir.id, ...formRecibir, lineas }),
      "Mercancía recibida e ingresada al inventario",
      () => setDialogRecibir(null),
    );
  };

  const resumenRecibido = (orden: OrdenCompra) => {
    const dets = detalles[orden.id] || [];
    const total = dets.reduce((s, d) => s + Number(d.cantidad), 0);
    const recibido = dets.reduce((s, d) => s + Number(d.cantidad_recibida), 0);
    return `${recibido}/${total}`;
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><ClipboardList className="size-5" /> Compras</h2>
          <p className="text-sm text-muted-foreground">{ordenes.length} órdenes de compra.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-56" placeholder="Buscar por número o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "activas")}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="activas">Activas</SelectItem>
              <SelectItem value="recibidas">Recibidas</SelectItem>
              <SelectItem value="anuladas">Anuladas</SelectItem>
              <SelectItem value="todas">Todas</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => abrirForm()}><Plus className="size-4" /> Nueva Orden</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Recibido</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin órdenes de compra.</TableCell></TableRow>
                )}
                {lista.map(o => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setOrdenSel(o)}>
                    <TableCell className="font-semibold">#{o.numero}</TableCell>
                    <TableCell>{formatoFecha(o.fecha)}</TableCell>
                    <TableCell className="max-w-48 truncate">{o.proveedor || "-"}</TableCell>
                    <TableCell className="text-right">{formatoPesos(o.total)}</TableCell>
                    <TableCell className="text-center text-sm">{resumenRecibido(o)}</TableCell>
                    <TableCell><Badge variant={BADGE_ESTADO[o.estado] || "outline"}>{o.estado}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG DETALLE */}
      <Dialog open={!!ordenSel} onOpenChange={o => !o && setOrdenSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Orden de Compra #{ordenSel?.numero} · {ordenSel?.proveedor || "Sin proveedor"}</DialogTitle>
          </DialogHeader>
          {ordenSel && (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{formatoFecha(ordenSel.fecha)}</p></div>
                <div><p className="text-muted-foreground">Fecha esperada</p><p className="font-medium">{formatoFecha(ordenSel.fecha_esperada)}</p></div>
                <div><p className="text-muted-foreground">Estado</p><Badge variant={BADGE_ESTADO[ordenSel.estado] || "outline"}>{ordenSel.estado}</Badge></div>
                {ordenSel.observaciones && <div className="col-span-3"><p className="text-muted-foreground">Observaciones</p><p>{ordenSel.observaciones}</p></div>}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Recibido</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detalles[ordenSel.id] || []).map(d => (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-52 truncate">{d.producto}</TableCell>
                        <TableCell className="text-right">{d.cantidad}</TableCell>
                        <TableCell className={`text-right ${Number(d.cantidad_recibida) >= Number(d.cantidad) ? "text-primary" : ""}`}>{d.cantidad_recibida}</TableCell>
                        <TableCell className="text-right">{formatoPesos(d.precio_unitario)}</TableCell>
                        <TableCell className="text-right">{formatoPesos(d.valor_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-right text-sm">Total: <span className="font-bold">{formatoPesos(ordenSel.total)}</span></p>
            </div>
          )}
          <DialogFooter>
            <div className="flex flex-wrap gap-2">
              {ordenSel?.estado === "Borrador" && (
                <>
                  <Button variant="outline" onClick={() => { const o = ordenSel; setOrdenSel(null); abrirForm(o); }}><Pencil className="size-4" /> Editar</Button>
                  <Button
                    disabled={pendiente}
                    onClick={() => ordenSel && correr(() => cambiarEstadoOrden(ordenSel.id, "Enviada"), "Orden marcada como Enviada", () => setOrdenSel(null))}
                  >
                    <Send className="size-4" /> Marcar Enviada
                  </Button>
                </>
              )}
              {(ordenSel?.estado === "Enviada" || ordenSel?.estado === "Recibida Parcial") && (
                <Button disabled={pendiente} onClick={() => ordenSel && abrirRecibir(ordenSel)}>
                  <PackageCheck className="size-4" /> Recibir Mercancía
                </Button>
              )}
              {(ordenSel?.estado === "Borrador" || ordenSel?.estado === "Enviada") && (
                <Button variant="destructive" onClick={() => { setPinAnular(""); setDialogAnular(ordenSel); setOrdenSel(null); }}>
                  <Ban className="size-4" /> Anular
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG FORM ORDEN */}
      <Dialog open={dialogForm} onOpenChange={setDialogForm}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{ordenEditando ? `Editar Orden #${ordenEditando.numero}` : "Nueva Orden de Compra"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Proveedor *</Label>
              <Combobox
                items={proveedores}
                itemToStringLabel={(p: Proveedor | null) => p?.nombre ?? ""}
                value={proveedorSel}
                onValueChange={v => setProveedorSel((v as Proveedor) ?? null)}
                inputValue={busquedaProveedor}
                onInputValueChange={v => setBusquedaProveedor(v ?? "")}
                openOnInputClick
              >
                <ComboboxInput placeholder="Buscar proveedor..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>No se encontró. Créalo en el módulo Proveedores.</ComboboxEmpty>
                  <ComboboxList>
                    {(p: Proveedor) => <ComboboxItem key={p.id} value={p}>{p.nombre}{p.nit ? ` · ${p.nit}` : ""}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={formOC.fecha} onChange={e => setFormOC({ ...formOC, fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Fecha esperada de entrega</Label><Input type="date" value={formOC.fecha_esperada} onChange={e => setFormOC({ ...formOC, fecha_esperada: e.target.value })} /></div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Productos</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setLineasForm(p => [...p, { ...LINEA_VACIA }])}>
                <Plus className="size-4" /> Añadir Línea
              </Button>
            </div>
            {lineasForm.map((l, i) => (
              <div key={i} className="relative grid gap-2 rounded-lg border border-l-4 border-l-primary p-3">
                {lineasForm.length > 1 && (
                  <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-destructive" onClick={() => setLineasForm(prev => prev.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
                <div className="grid gap-1.5">
                  <Label>Producto *</Label>
                  <SelectorProductoOC
                    productos={inventariables}
                    valor={l.producto}
                    onCambio={p => setLinea(i, { producto: p, precio_unitario: p ? Number(p.precio_compra) || l.precio_unitario : l.precio_unitario })}
                    busqueda={l.busqueda}
                    setBusqueda={v => setLinea(i, { busqueda: v })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="grid gap-1.5"><Label>Cantidad *</Label><Input type="number" min={0} value={l.cantidad || ""} onChange={e => setLinea(i, { cantidad: Number(e.target.value) })} placeholder="0" /></div>
                  <div className="grid gap-1.5"><Label>Precio unitario</Label><Input type="number" min={0} value={l.precio_unitario || ""} onChange={e => setLinea(i, { precio_unitario: Number(e.target.value) })} placeholder="0" /></div>
                  <div className="grid gap-1.5">
                    <Label>Total línea</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">
                      {formatoPesos((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="grid gap-1.5"><Label>Observaciones</Label><Textarea rows={2} value={formOC.observaciones} onChange={e => setFormOC({ ...formOC, observaciones: e.target.value })} /></div>
            <p className="text-right text-sm">Total de la orden: <span className="font-bold">{formatoPesos(totalForm)}</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogForm(false)}>Cancelar</Button>
            <Button onClick={guardarForm} disabled={pendiente || !proveedorSel}>{ordenEditando ? "Guardar Cambios" : "Crear Orden (Borrador)"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG RECIBIR */}
      <Dialog open={!!dialogRecibir} onOpenChange={o => !o && setDialogRecibir(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Recibir Mercancía — OC #{dialogRecibir?.numero}</DialogTitle></DialogHeader>
          {dialogRecibir && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Número de factura</Label><Input value={formRecibir.numero_factura} onChange={e => setFormRecibir({ ...formRecibir, numero_factura: e.target.value })} placeholder="Factura del proveedor" /></div>
                <div className="grid gap-1.5"><Label>Fecha de recepción</Label><Input type="date" value={formRecibir.fecha} onChange={e => setFormRecibir({ ...formRecibir, fecha: e.target.value })} /></div>
              </div>

              <p className="text-sm font-semibold">Cantidades a recibir</p>
              {(detalles[dialogRecibir.id] || []).map(d => {
                const pendienteLinea = Number(d.cantidad) - Number(d.cantidad_recibida);
                if (pendienteLinea <= 0) return (
                  <div key={d.id} className="rounded-md border bg-muted/30 p-2 text-sm text-muted-foreground">
                    {d.producto} — completa ({d.cantidad_recibida}/{d.cantidad})
                  </div>
                );
                const r = cantidadesRecibir[d.id] || { cantidad: 0, ubicacion_id: 0, lote: "" };
                return (
                  <div key={d.id} className="grid gap-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{d.producto} <span className="text-xs text-muted-foreground">· pendiente: {pendienteLinea}</span></p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-xs">Cantidad</Label>
                        <Input type="number" min={0} max={pendienteLinea} value={r.cantidad || ""}
                          onChange={e => setCantidadesRecibir(prev => ({ ...prev, [d.id]: { ...r, cantidad: Number(e.target.value) } }))} placeholder="0" />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Ubicación</Label>
                        <Select value={r.ubicacion_id ? String(r.ubicacion_id) : ""} onValueChange={v => v && setCantidadesRecibir(prev => ({ ...prev, [d.id]: { ...r, ubicacion_id: Number(v) } }))}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="..." /></SelectTrigger>
                          <SelectContent>
                            {ubicaciones.filter(u => u.activa).map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs">Lote</Label>
                        <Input value={r.lote} onChange={e => setCantidadesRecibir(prev => ({ ...prev, [d.id]: { ...r, lote: e.target.value } }))} placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                );
              })}

              <label className="flex items-center gap-2 text-sm">
                <Switch checked={formRecibir.crear_gasto} onCheckedChange={v => setFormRecibir({ ...formRecibir, crear_gasto: v })} />
                Generar el Gasto en Financiero por esta recepción ({formatoPesos(totalRecibir)})
              </label>
              <p className="text-xs text-muted-foreground">
                Cada recepción parcial genera su propio gasto (la cuenta por pagar de esa factura), pagable después desde Financiero.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRecibir(null)}>Cancelar</Button>
            <Button onClick={confirmarRecepcion} disabled={pendiente || totalRecibir < 0}>
              {pendiente ? "Recibiendo..." : "Confirmar Recepción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG ANULAR (PIN) */}
      <Dialog open={!!dialogAnular} onOpenChange={o => !o && setDialogAnular(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Anular Orden #{dialogAnular?.numero}</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label>PIN de autorización</Label>
            <Input type="password" value={pinAnular} onChange={e => setPinAnular(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAnular(null)}>Cancelar</Button>
            <Button
              variant="destructive" disabled={pendiente || !pinAnular.trim()}
              onClick={() => dialogAnular && correr(
                () => cambiarEstadoOrden(dialogAnular.id, "Anulada", pinAnular),
                "Orden anulada",
                () => setDialogAnular(null),
              )}
            >
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
