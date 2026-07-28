"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearGasto, editarGasto, pagarGasto, crearCategoriaGasto, crearProveedor, type LineaGasto } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { HandCoins, PlusCircle, Plus, Trash2, Pencil, ShieldAlert, CheckCircle2, Truck } from "lucide-react";
import { formatoPesos, formatoFecha, type Gasto, type GastoDetalle, type PagoGasto, type CuentaBancaria, type Proveedor, type Bitacora } from "@/lib/tipos";

type Props = {
  gastos: Gasto[];
  pagosGastos: Record<number, PagoGasto[]>;
  cuentas: CuentaBancaria[];
  categorias: string[];
  proveedores: Proveedor[];
  gastosDetalle: Record<number, GastoDetalle[]>;
  auditoriaGastos: Record<number, Bitacora[]>;
  unidadesMedida: string[];
};

const HOY = () => new Date().toISOString().slice(0, 10);
const LINEA_VACIA: LineaGasto = { cantidad: 1, unidad_medida: "", articulo: "", precio_unitario: 0 };

export function GastosCliente({ gastos, pagosGastos, cuentas, categorias: categoriasIniciales, proveedores: proveedoresIniciales, gastosDetalle, auditoriaGastos, unidadesMedida }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [proveedores, setProveedores] = useState(proveedoresIniciales);

  // Causación
  const [nuevo, setNuevo] = useState({
    fecha: HOY(), tipo: "Gasto" as "Gasto" | "Costo", categoria: "", numero_factura: "",
    pagarAhora: false, cuenta_id: 0,
  });
  const [lineas, setLineas] = useState<LineaGasto[]>([{ ...LINEA_VACIA }]);
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");

  // Nuevo proveedor (al vuelo)
  const [dialogProveedor, setDialogProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({ nombre: "", nit: "", contacto: "", correo: "", ciudad: "" });

  // Nueva categoría
  const [dialogCategoria, setDialogCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");

  const montoNuevo = useMemo(
    () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0),
    [lineas]
  );

  const setLinea = (i: number, campo: keyof LineaGasto, valor: string | number) => {
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const guardarCategoria = () => {
    const valor = nuevaCategoria.trim();
    if (!valor) return;
    startTransition(async () => {
      try {
        await crearCategoriaGasto(valor);
        setCategorias(prev => (prev.includes(valor) ? prev : [...prev, valor].sort()));
        setNuevo(n => ({ ...n, categoria: valor }));
        setDialogCategoria(false);
        setNuevaCategoria("");
        toast.success("Categoría creada");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const guardarNuevoProveedor = () => {
    startTransition(async () => {
      try {
        const p = await crearProveedor(nuevoProveedor);
        setProveedores(prev => [...prev, p as Proveedor]);
        setProveedorSel(p as Proveedor);
        setBusquedaProveedor((p as Proveedor).nombre);
        setDialogProveedor(false);
        setNuevoProveedor({ nombre: "", nit: "", contacto: "", correo: "", ciudad: "" });
        toast.success("Proveedor registrado y seleccionado");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // Filtros
  // "todos" por defecto: si se filtrara por pendientes, la tabla aparece vacía
  // cuando ya está todo pagado y parece un error.
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCuenta, setFiltroCuenta] = useState("todas");
  const [busqueda, setBusqueda] = useState("");

  // Detalle (solo lectura)
  const [sel, setSel] = useState<Gasto | null>(null);

  // Pago
  const [selPago, setSelPago] = useState<Gasto | null>(null);
  const [pago, setPago] = useState({ monto: 0, cuenta_id: 0, fecha: HOY(), comentario: "" });

  // Clave de la contadora (edición)
  const [claveAbierta, setClaveAbierta] = useState(false);
  const [claveContadora, setClaveContadora] = useState("");

  // Edición
  const [edicionAbierta, setEdicionAbierta] = useState(false);
  const [edicionGastoId, setEdicionGastoId] = useState<number | null>(null);
  const [edicionTicket, setEdicionTicket] = useState<number | null>(null);
  const [claveEdicion, setClaveEdicion] = useState("");
  const [lineasEd, setLineasEd] = useState<LineaGasto[]>([]);
  const [genEd, setGenEd] = useState({ fecha: "", tipo: "Gasto" as "Gasto" | "Costo", categoria: "", numero_factura: "" });
  const [proveedorEdSel, setProveedorEdSel] = useState<Proveedor | null>(null);
  const [busquedaProveedorEd, setBusquedaProveedorEd] = useState("");
  const [motivoEdicion, setMotivoEdicion] = useState("");

  // Cuentas bancarias desde donde se pagó cada gasto (según sus abonos registrados)
  const nombreCuenta = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cuentas) m.set(c.id, c.nombre);
    return m;
  }, [cuentas]);

  const cuentasDeGasto = useMemo(() => {
    const m = new Map<number, { ids: number[]; nombres: string }>();
    for (const g of gastos) {
      const ids = [...new Set((pagosGastos[g.id] || []).map(p => p.cuenta_id).filter(Boolean) as number[])];
      m.set(g.id, { ids, nombres: ids.map(id => nombreCuenta.get(id) || "—").join(", ") });
    }
    return m;
  }, [gastos, pagosGastos, nombreCuenta]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return gastos.filter(g => {
      if (filtroEstado === "pendientes" && g.saldo <= 0) return false;
      if (filtroEstado === "pagados" && g.saldo > 0) return false;
      if (filtroTipo !== "todos" && g.tipo !== filtroTipo) return false;
      if (filtroCuenta !== "todas" && !(cuentasDeGasto.get(g.id)?.ids || []).includes(Number(filtroCuenta))) return false;
      if (!q) return true;
      const arts = (gastosDetalle[g.id] || []).map(d => d.articulo).join(" ");
      return arts.toLowerCase().includes(q) ||
        (g.descripcion || "").toLowerCase().includes(q) ||
        (g.proveedor || "").toLowerCase().includes(q) ||
        (g.categoria || "").toLowerCase().includes(q) ||
        String(g.ticket) === q;
    });
  }, [gastos, gastosDetalle, filtroEstado, filtroTipo, filtroCuenta, cuentasDeGasto, busqueda]);

  const totalPendiente = useMemo(() => gastos.reduce((s, g) => s + (g.saldo > 0 ? Number(g.saldo) : 0), 0), [gastos]);

  const guardarNuevo = () => {
    startTransition(async () => {
      try {
        const r = await crearGasto({
          fecha: nuevo.fecha, tipo: nuevo.tipo, categoria: nuevo.categoria,
          proveedor_id: proveedorSel?.id || null, proveedor: proveedorSel?.nombre || "",
          numero_factura: nuevo.numero_factura, lineas,
          pagarAhora: nuevo.pagarAhora, cuenta_id: nuevo.cuenta_id || undefined,
        });
        toast.success(`Gasto #${r.ticket} ${nuevo.pagarAhora ? "registrado y pagado" : "causado (pendiente por pagar)"}`);
        setNuevo({ fecha: HOY(), tipo: "Gasto", categoria: "", numero_factura: "", pagarAhora: false, cuenta_id: 0 });
        setLineas([{ ...LINEA_VACIA }]);
        setProveedorSel(null);
        setBusquedaProveedor("");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirDetalle = (g: Gasto) => setSel(g);

  const abrirPagoDesdeDetalle = () => {
    if (!sel) return;
    setSelPago(sel);
    setPago({ monto: Number(sel.saldo), cuenta_id: 0, fecha: HOY(), comentario: "" });
    setSel(null);
  };

  const procesarPago = () => {
    if (!selPago) return;
    startTransition(async () => {
      try {
        await pagarGasto({ gasto_id: selPago.id, ...pago });
        toast.success("Pago registrado");
        setSelPago(null);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const pedirClave = () => {
    setClaveContadora("");
    setClaveAbierta(true);
  };

  const abrirEdicion = (g: Gasto) => {
    const dets = gastosDetalle[g.id] || [];
    setLineasEd(dets.length
      ? dets.map(d => ({ cantidad: Number(d.cantidad) || 1, unidad_medida: d.unidad_medida || "", articulo: d.articulo, precio_unitario: Number(d.precio_unitario) || 0 }))
      : [{ ...LINEA_VACIA, articulo: g.descripcion || g.categoria || "" }]);
    setGenEd({ fecha: g.fecha, tipo: g.tipo, categoria: g.categoria || "", numero_factura: g.numero_factura || "" });
    const prov = proveedores.find(p => p.id === g.proveedor_id) || null;
    setProveedorEdSel(prov);
    setBusquedaProveedorEd(prov?.nombre || g.proveedor || "");
    setMotivoEdicion("");
    setEdicionAbierta(true);
  };

  const confirmarClave = () => {
    if (!sel) return;
    const gasto = sel;
    const clave = claveContadora;
    setClaveAbierta(false);
    setSel(null);
    setEdicionGastoId(gasto.id);
    setEdicionTicket(gasto.ticket);
    setClaveEdicion(clave);
    abrirEdicion(gasto);
  };

  const setLineaEd = (i: number, campo: keyof LineaGasto, valor: string | number) => {
    setLineasEd(prev => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  };

  const montoEd = useMemo(
    () => lineasEd.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0),
    [lineasEd]
  );

  const guardarEdicion = () => {
    if (!edicionGastoId) return;
    startTransition(async () => {
      try {
        await editarGasto({
          gasto_id: edicionGastoId, clave_contadora: claveEdicion,
          fecha: genEd.fecha, tipo: genEd.tipo, categoria: genEd.categoria,
          proveedor_id: proveedorEdSel?.id || null, proveedor: proveedorEdSel?.nombre || busquedaProveedorEd,
          numero_factura: genEd.numero_factura, lineas: lineasEd, motivo: motivoEdicion,
        });
        toast.success("Gasto actualizado");
        setEdicionAbierta(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const SelectorCuenta = ({ valor, onCambio }: { valor: number; onCambio: (id: number) => void }) => (
    <Select value={valor ? String(valor) : ""} onValueChange={v => v && onCambio(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione cuenta..." /></SelectTrigger>
      <SelectContent>
        {cuentas.map(c => (
          <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const camposLinea = (l: LineaGasto, i: number, onCambio: (i: number, campo: keyof LineaGasto, valor: string | number) => void, lista: LineaGasto[], onQuitar: (i: number) => void) => (
    <div key={i} className="relative rounded-lg border border-l-4 border-l-primary p-3">
      {lista.length > 1 && (
        <Button variant="ghost" size="icon" className="absolute right-1 top-1 size-7 text-destructive" onClick={() => onQuitar(i)}>
          <Trash2 className="size-4" />
        </Button>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label>Artículo *</Label>
          <Input value={l.articulo} onChange={e => onCambio(i, "articulo", e.target.value)} placeholder="Ej. Tela Jersey" />
        </div>
        <div className="grid gap-1.5">
          <Label>Cantidad</Label>
          <Input type="number" step="any" min={0} value={l.cantidad} onChange={e => onCambio(i, "cantidad", Number(e.target.value))} />
        </div>
        <div className="grid gap-1.5">
          <Label>Unidad de Medida</Label>
          <Combo opciones={unidadesMedida} value={l.unidad_medida || ""} onChange={v => onCambio(i, "unidad_medida", v)} placeholder="Unidad" />
        </div>
        <div className="grid gap-1.5">
          <Label>Precio Unitario</Label>
          <Input type="number" step="any" min={0} value={l.precio_unitario || ""} onChange={e => onCambio(i, "precio_unitario", Number(e.target.value))} placeholder="0" />
        </div>
        <div className="grid gap-1.5">
          <Label>Total Línea</Label>
          <Input readOnly value={formatoPesos((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))} className="bg-muted font-semibold" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[380px_1fr]">
      {/* CAUSAR GASTO */}
      <Card className="h-fit">
        <CardHeader><CardTitle>Registrar Gasto / Costo</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={nuevo.tipo} onValueChange={v => v && setNuevo({ ...nuevo, tipo: v as "Gasto" | "Costo" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Gasto">Gasto</SelectItem>
                  <SelectItem value="Costo">Costo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Categoría</Label>
            <div className="flex gap-1.5">
              <div className="flex-1"><Combo opciones={categorias} value={nuevo.categoria} onChange={v => setNuevo({ ...nuevo, categoria: v })} /></div>
              <Button type="button" variant="outline" size="icon" title="Nueva categoría" onClick={() => { setNuevaCategoria(""); setDialogCategoria(true); }}>
                <PlusCircle className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Proveedor</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setNuevoProveedor({ nombre: "", nit: "", contacto: "", correo: "", ciudad: "" }); setDialogProveedor(true); }}>
                <Truck className="size-3.5" /> Nuevo
              </Button>
            </div>
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
                <ComboboxEmpty>No se encontró. Usa &quot;Nuevo&quot;.</ComboboxEmpty>
                <ComboboxList>
                  {(p: Proveedor) => (
                    <ComboboxItem key={p.id} value={p}>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.nombre} {p.nit && <span className="text-primary">· {p.nit}</span>}</span>
                        <span className="text-xs text-muted-foreground">{p.ciudad || "-"}</span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {proveedorSel && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                <CheckCircle2 className="size-3.5 text-primary" />
                <span className="font-semibold">{proveedorSel.nombre}</span>
                {proveedorSel.nit && <span className="text-muted-foreground">NIT: {proveedorSel.nit}</span>}
              </div>
            )}
          </div>

          <div className="grid gap-1.5"><Label>Número de Factura</Label><Input value={nuevo.numero_factura} onChange={e => setNuevo({ ...nuevo, numero_factura: e.target.value })} placeholder="Opcional" /></div>

          <div className="flex items-center justify-between">
            <Label>Artículos</Label>
            <Button variant="outline" size="sm" onClick={() => setLineas(p => [...p, { ...LINEA_VACIA }])}>
              <Plus className="size-4" /> Añadir
            </Button>
          </div>
          <div className="grid gap-3">
            {lineas.map((l, i) => camposLinea(l, i, setLinea, lineas, idx => setLineas(prev => prev.filter((_, j) => j !== idx))))}
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
            <span>Monto Total</span>
            <span className="text-lg font-bold text-primary">{formatoPesos(montoNuevo)}</span>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={nuevo.pagarAhora} onCheckedChange={v => setNuevo({ ...nuevo, pagarAhora: v })} />
            Pagar ahora (salida inmediata de la cuenta)
          </label>
          {nuevo.pagarAhora && (
            <div className="grid gap-1.5"><Label>Cuenta desde donde se paga *</Label><SelectorCuenta valor={nuevo.cuenta_id} onCambio={id => setNuevo({ ...nuevo, cuenta_id: id })} /></div>
          )}
          <Button onClick={guardarNuevo} disabled={pendiente || montoNuevo <= 0 || (nuevo.pagarAhora && !nuevo.cuenta_id)}>
            {nuevo.pagarAhora ? "Registrar y Pagar" : "Causar (pendiente por pagar)"}
          </Button>
        </CardContent>
      </Card>

      {/* LISTA */}
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Gastos y Costos</CardTitle>
            <p className="text-sm text-muted-foreground">Pendiente por pagar: <span className="font-bold text-destructive">{formatoPesos(totalPendiente)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-44" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v || "todos")}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="Gasto">Gastos</SelectItem>
                <SelectItem value="Costo">Costos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "todos")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="pagados">Pagados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroCuenta} onValueChange={v => setFiltroCuenta(v || "todas")}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Cuenta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuentas</SelectItem>
                {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {gastos.length === 0
                      ? "Aún no hay gastos registrados."
                      : `Ningún gasto coincide con los filtros (hay ${gastos.length} en total).`}
                  </TableCell></TableRow>
                )}
                {lista.map(g => (
                  <TableRow key={g.id} className="cursor-pointer" onClick={() => abrirDetalle(g)}>
                    <TableCell className="font-semibold">#{g.ticket}</TableCell>
                    <TableCell>{formatoFecha(g.fecha)}</TableCell>
                    <TableCell><Badge variant={g.tipo === "Costo" ? "default" : "secondary"}>{g.tipo}</Badge></TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">
                        {(gastosDetalle[g.id] || []).map(d => d.articulo).join(", ") || g.descripcion || g.categoria || "-"}
                      </span>
                      <span className="block text-xs text-muted-foreground">{[g.categoria, g.proveedor].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm">{cuentasDeGasto.get(g.id)?.nombres || "—"}</TableCell>
                    <TableCell className="text-right">{formatoPesos(g.monto)}</TableCell>
                    <TableCell className={`text-right font-bold ${g.saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(g.saldo)}</TableCell>
                    <TableCell><Badge variant={g.estado === "Pagado" ? "default" : g.estado === "Abonado" ? "secondary" : "outline"}>{g.estado}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Haz clic en una fila para ver el detalle, pagar o editar.</p>
        </CardContent>
      </Card>

      {/* DIALOG NUEVA CATEGORÍA */}
      <Dialog open={dialogCategoria} onOpenChange={setDialogCategoria}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Categoría de Gasto</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label>Nombre *</Label>
            <Input value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarCategoria()} placeholder="Ej. Mantenimiento" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCategoria(false)}>Cancelar</Button>
            <Button onClick={guardarCategoria} disabled={pendiente || !nuevaCategoria.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG NUEVO PROVEEDOR (al vuelo) */}
      <Dialog open={dialogProveedor} onOpenChange={setDialogProveedor}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Proveedor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevoProveedor.nombre} onChange={e => setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>NIT / Identificación</Label><Input value={nuevoProveedor.nit} onChange={e => setNuevoProveedor({ ...nuevoProveedor, nit: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={nuevoProveedor.contacto} onChange={e => setNuevoProveedor({ ...nuevoProveedor, contacto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Correo</Label><Input value={nuevoProveedor.correo} onChange={e => setNuevoProveedor({ ...nuevoProveedor, correo: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Ciudad</Label><Input value={nuevoProveedor.ciudad} onChange={e => setNuevoProveedor({ ...nuevoProveedor, ciudad: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={guardarNuevoProveedor} disabled={pendiente || !nuevoProveedor.nombre.trim()}>Guardar y Seleccionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETALLE DE SOLO LECTURA */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{sel?.tipo} #{sel?.ticket}</DialogTitle></DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{formatoFecha(sel.fecha)}</p></div>
                <div><p className="text-muted-foreground">Categoría</p><p className="font-medium">{sel.categoria || "-"}</p></div>
                <div><p className="text-muted-foreground">Proveedor</p><p className="font-medium">{sel.proveedor || "-"}</p></div>
                <div><p className="text-muted-foreground">Número de Factura</p><p className="font-medium">{sel.numero_factura || "-"}</p></div>
              </div>

              <div>
                <p className="mb-1 text-sm font-semibold">Artículos</p>
                <div className="grid gap-2">
                  {(gastosDetalle[sel.id] || []).map(d => (
                    <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="font-medium">{d.articulo} {d.unidad_medida && <span className="text-xs text-muted-foreground">({d.unidad_medida})</span>}</span>
                      <span>{d.cantidad} x {formatoPesos(d.precio_unitario)} = <strong>{formatoPesos(d.valor_total)}</strong></span>
                    </div>
                  ))}
                  {!(gastosDetalle[sel.id] || []).length && <p className="text-sm text-muted-foreground">{sel.descripcion || "Sin artículos registrados (gasto histórico)."}</p>}
                </div>
              </div>

              {(pagosGastos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Pagos anteriores</p>
                  <div className="grid gap-1 text-sm">
                    {pagosGastos[sel.id].map(p => (
                      <div key={p.id} className="flex justify-between">
                        <span>{formatoFecha(p.fecha)} {p.comentario && `— ${p.comentario}`}</span>
                        <span className="font-medium">{formatoPesos(p.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Monto</p><p className="font-bold">{formatoPesos(sel.monto)}</p></div>
                <div><p className="text-muted-foreground">Abonado</p><p className="font-bold">{formatoPesos(sel.abonado)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(sel.saldo)}</p></div>
              </div>

              {(auditoriaGastos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Historial de cambios</p>
                  <div className="grid gap-2">
                    {auditoriaGastos[sel.id].map(a => (
                      <details key={a.id} className="rounded-md border p-2 text-sm">
                        <summary className="cursor-pointer">
                          {new Date(a.fecha).toLocaleString("es-CO")} — {a.usuario || "-"} {a.motivo && <span className="text-muted-foreground">({a.motivo})</span>}
                        </summary>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground">Antes</p>
                            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.datos_anteriores, null, 2)}</pre>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground">Después</p>
                            <pre className="max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(a.datos_nuevos, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldAlert className="size-3.5" /> Editar requiere la clave de la contadora.
            </div>
            <div className="flex gap-2">
              {sel && sel.saldo > 0 && <Button variant="outline" onClick={abrirPagoDesdeDetalle}><HandCoins className="size-4" /> Pagar</Button>}
              <Button variant="outline" onClick={pedirClave}><Pencil className="size-4" /> Editar</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLAVE DE LA CONTADORA */}
      <Dialog open={claveAbierta} onOpenChange={setClaveAbierta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Autorizar edición</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label>Clave de la contadora</Label>
            <Input type="password" value={claveContadora} onChange={e => setClaveContadora(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmarClave()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaveAbierta(false)}>Cancelar</Button>
            <Button onClick={confirmarClave} disabled={!claveContadora.trim()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG PAGO */}
      <Dialog open={!!selPago} onOpenChange={o => !o && setSelPago(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Pagar {selPago?.tipo} #{selPago?.ticket}</DialogTitle></DialogHeader>
          {selPago && (
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Monto</p><p className="font-bold">{formatoPesos(selPago.monto)}</p></div>
                <div><p className="text-muted-foreground">Abonado</p><p className="font-bold">{formatoPesos(selPago.abonado)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(selPago.saldo)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto a pagar *</Label><Input type="number" step="any" min={0} value={pago.monto || ""} onChange={e => setPago({ ...pago, monto: Number(e.target.value) })} /></div>
                <div className="grid gap-1.5"><Label>Cuenta *</Label><SelectorCuenta valor={pago.cuenta_id} onCambio={id => setPago({ ...pago, cuenta_id: id })} /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Comentario</Label><Input value={pago.comentario} onChange={e => setPago({ ...pago, comentario: e.target.value })} /></div>
              </div>
              <p className="text-sm">
                Saldo después del pago:{" "}
                <span className={`font-bold ${selPago.saldo - pago.monto > 0 ? "text-destructive" : "text-primary"}`}>
                  {formatoPesos(selPago.saldo - pago.monto)}
                </span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelPago(null)}>Cancelar</Button>
            <Button onClick={procesarPago} disabled={pendiente || pago.monto <= 0 || !pago.cuenta_id}>
              {pendiente ? "Procesando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDICIÓN DE GASTO */}
      <Dialog open={edicionAbierta} onOpenChange={setEdicionAbierta}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Editar Gasto #{edicionTicket ?? ""}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={genEd.fecha} onChange={e => setGenEd({ ...genEd, fecha: e.target.value })} /></div>
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={genEd.tipo} onValueChange={v => v && setGenEd({ ...genEd, tipo: v as "Gasto" | "Costo" })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Gasto">Gasto</SelectItem>
                    <SelectItem value="Costo">Costo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5"><Label>Categoría</Label><Combo opciones={categorias} value={genEd.categoria} onChange={v => setGenEd({ ...genEd, categoria: v })} /></div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Proveedor</Label>
                <Combobox
                  items={proveedores}
                  itemToStringLabel={(p: Proveedor | null) => p?.nombre ?? ""}
                  value={proveedorEdSel}
                  onValueChange={v => setProveedorEdSel((v as Proveedor) ?? null)}
                  inputValue={busquedaProveedorEd}
                  onInputValueChange={v => setBusquedaProveedorEd(v ?? "")}
                  openOnInputClick
                >
                  <ComboboxInput placeholder="Buscar proveedor..." className="w-full" showClear />
                  <ComboboxContent>
                    <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                    <ComboboxList>
                      {(p: Proveedor) => <ComboboxItem key={p.id} value={p}>{p.nombre}</ComboboxItem>}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
              <div className="grid gap-1.5"><Label>Número de Factura</Label><Input value={genEd.numero_factura} onChange={e => setGenEd({ ...genEd, numero_factura: e.target.value })} /></div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Artículos</p>
              <Button variant="outline" size="sm" onClick={() => setLineasEd(p => [...p, { ...LINEA_VACIA }])}>
                <Plus className="size-4" /> Añadir
              </Button>
            </div>
            <div className="grid gap-3">
              {lineasEd.map((l, i) => camposLinea(l, i, setLineaEd, lineasEd, idx => setLineasEd(prev => prev.filter((_, j) => j !== idx))))}
            </div>

            <div className="grid gap-1.5">
              <Label>Motivo del cambio (opcional)</Label>
              <Textarea rows={2} value={motivoEdicion} onChange={e => setMotivoEdicion(e.target.value)} placeholder="Ej. Corrección de precio por error de digitación" />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
              <span>Nuevo monto total:</span>
              <span className="text-lg font-bold text-primary">{formatoPesos(montoEd)}</span>
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
    </div>
  );
}
