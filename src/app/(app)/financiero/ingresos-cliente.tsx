"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearIngreso, editarIngreso, cobrarIngreso, crearCategoriaIngreso, crearClienteDesdeFinanciero, actualizarFacturacionIngreso, anularCobroIngreso, eliminarIngreso } from "./acciones";
import { DialogoBorrado } from "./dialogo-borrado";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { HandCoins, PlusCircle, Pencil, ShieldAlert, UserPlus, CheckCircle2, FileText, Trash2 } from "lucide-react";
import { formatoPesos, formatoFecha, type Ingreso, type PagoIngreso, type CuentaBancaria, type Bitacora, type Cliente } from "@/lib/tipos";

type Props = {
  ingresos: Ingreso[];
  pagosIngresos: Record<number, PagoIngreso[]>;
  cuentas: CuentaBancaria[];
  categorias: string[];
  auditoriaIngresos: Record<number, Bitacora[]>;
  clientes: Cliente[];
};

const HOY = () => new Date().toISOString().slice(0, 10);
const TIPOS_INGRESO = ["Abono a Factura", "Cancela Factura", "Otro"] as const;
const ESTADOS_FACTURACION = ["Pendiente de Facturar", "Facturado", "No Aplica"] as const;

export function IngresosCliente({ ingresos, pagosIngresos, cuentas, categorias: categoriasIniciales, auditoriaIngresos, clientes: clientesIniciales }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [clientes, setClientes] = useState(clientesIniciales);

  // Causación
  const [nuevo, setNuevo] = useState({
    fecha: HOY(), categoria: "", concepto: "", monto: 0, cobrarAhora: false, cuenta_id: 0,
    tipo_ingreso: "", estado_facturacion: "No Aplica", numero_factura: "",
  });
  const [clienteSel, setClienteSel] = useState<Cliente | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");

  // Nueva categoría
  const [dialogCategoria, setDialogCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");

  // Nuevo cliente (al vuelo)
  const [dialogCliente, setDialogCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "" });

  const guardarNuevoCliente = () => {
    startTransition(async () => {
      try {
        const c = await crearClienteDesdeFinanciero(nuevoCliente);
        setClientes(prev => [...prev, c as Cliente]);
        setClienteSel(c as Cliente);
        setBusquedaCliente((c as Cliente).nombre);
        setDialogCliente(false);
        setNuevoCliente({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "" });
        toast.success("Cliente registrado y seleccionado");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const guardarCategoria = () => {
    const valor = nuevaCategoria.trim();
    if (!valor) return;
    startTransition(async () => {
      try {
        await crearCategoriaIngreso(valor);
        setCategorias(prev => (prev.includes(valor) ? prev : [...prev, valor].sort()));
        setNuevo(n => ({ ...n, categoria: valor }));
        setDialogCategoria(false);
        setNuevaCategoria("");
        toast.success("Categoría creada");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // Filtros
  // "todos" por defecto: si se filtrara por pendientes, la tabla aparece vacía
  // cuando ya está todo cobrado y parece un error.
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroCuenta, setFiltroCuenta] = useState("todas");
  const [busqueda, setBusqueda] = useState("");

  // Detalle (solo lectura)
  const [sel, setSel] = useState<Ingreso | null>(null);

  // Cobro
  const [selCobro, setSelCobro] = useState<Ingreso | null>(null);
  const [cobro, setCobro] = useState({ monto: 0, cuenta_id: 0, fecha: HOY(), comentario: "" });

  // Clave de la contadora (edición)
  const [claveAbierta, setClaveAbierta] = useState(false);
  const [claveContadora, setClaveContadora] = useState("");

  // Edición
  const [edicionAbierta, setEdicionAbierta] = useState(false);
  const [edicionIngresoId, setEdicionIngresoId] = useState<number | null>(null);
  const [edicionTicket, setEdicionTicket] = useState<number | null>(null);
  const [claveEdicion, setClaveEdicion] = useState("");
  const [genEd, setGenEd] = useState({ fecha: "", categoria: "", concepto: "", monto: 0, tipo_ingreso: "" });
  const [clienteEdSel, setClienteEdSel] = useState<Cliente | null>(null);
  const [busquedaClienteEd, setBusquedaClienteEd] = useState("");
  const [motivoEdicion, setMotivoEdicion] = useState("");
  // El ingreso que se está editando estaba cobrado por completo
  const [edicionCobrado, setEdicionCobrado] = useState(false);
  const [ajustarCobro, setAjustarCobro] = useState(true);
  // Borrados (piden clave de contadora + motivo)
  const [cobroAnular, setCobroAnular] = useState<PagoIngreso | null>(null);
  const [ingresoBorrar, setIngresoBorrar] = useState<Ingreso | null>(null);

  // Actualizar Facturación (liviano, sin clave)
  const [selFacturacion, setSelFacturacion] = useState<Ingreso | null>(null);
  const [facturacion, setFacturacion] = useState({ estado_facturacion: "No Aplica", numero_factura: "" });

  // Cuentas bancarias donde se recibió cada ingreso (según sus cobros registrados)
  const nombreCuenta = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cuentas) m.set(c.id, c.nombre);
    return m;
  }, [cuentas]);

  const cuentasDeIngreso = useMemo(() => {
    const m = new Map<number, { ids: number[]; nombres: string }>();
    for (const i of ingresos) {
      const ids = [...new Set((pagosIngresos[i.id] || []).map(p => p.cuenta_id).filter(Boolean) as number[])];
      m.set(i.id, { ids, nombres: ids.map(id => nombreCuenta.get(id) || "—").join(", ") });
    }
    return m;
  }, [ingresos, pagosIngresos, nombreCuenta]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ingresos.filter(i => {
      if (filtroEstado === "pendientes" && i.saldo <= 0) return false;
      if (filtroEstado === "cobrados" && i.saldo > 0) return false;
      if (filtroCuenta !== "todas" && !(cuentasDeIngreso.get(i.id)?.ids || []).includes(Number(filtroCuenta))) return false;
      if (!q) return true;
      return (i.concepto || "").toLowerCase().includes(q) ||
        (i.categoria || "").toLowerCase().includes(q) ||
        (i.cliente || "").toLowerCase().includes(q) ||
        (i.numero_factura || "").toLowerCase().includes(q) ||
        String(i.ticket) === q;
    });
  }, [ingresos, filtroEstado, filtroCuenta, cuentasDeIngreso, busqueda]);

  const totalPendiente = useMemo(() => ingresos.reduce((s, i) => s + (i.saldo > 0 ? Number(i.saldo) : 0), 0), [ingresos]);

  const guardarNuevo = () => {
    startTransition(async () => {
      try {
        const r = await crearIngreso({
          ...nuevo,
          cliente_id: clienteSel?.id || null,
          cliente: clienteSel?.nombre || "",
          cuenta_id: nuevo.cuenta_id || undefined,
        });
        toast.success(`Ingreso #${r.ticket} ${nuevo.cobrarAhora ? "registrado y cobrado" : "causado (pendiente por cobrar)"}`);
        setNuevo({ fecha: HOY(), categoria: "", concepto: "", monto: 0, cobrarAhora: false, cuenta_id: 0, tipo_ingreso: "", estado_facturacion: "No Aplica", numero_factura: "" });
        setClienteSel(null);
        setBusquedaCliente("");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirDetalle = (i: Ingreso) => setSel(i);

  const abrirCobroDesdeDetalle = () => {
    if (!sel) return;
    setSelCobro(sel);
    setCobro({ monto: Number(sel.saldo), cuenta_id: 0, fecha: HOY(), comentario: "" });
    setSel(null);
  };

  const procesarCobro = () => {
    if (!selCobro) return;
    startTransition(async () => {
      try {
        await cobrarIngreso({ ingreso_id: selCobro.id, ...cobro });
        toast.success("Cobro registrado");
        setSelCobro(null);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const pedirClave = () => {
    setClaveContadora("");
    setClaveAbierta(true);
  };

  const abrirEdicion = (i: Ingreso) => {
    setGenEd({ fecha: i.fecha, categoria: i.categoria || "", concepto: i.concepto || "", monto: Number(i.monto) || 0, tipo_ingreso: i.tipo_ingreso || "" });
    const cli = clientes.find(c => c.id === i.cliente_id) || null;
    setClienteEdSel(cli);
    setBusquedaClienteEd(cli?.nombre || i.cliente || "");
    setMotivoEdicion("");
    // Solo tiene sentido arrastrar el cobro si el ingreso ya estaba saldado.
    const saldado = (Number(i.cobrado) || 0) > 0 && (Number(i.saldo) || 0) <= 0;
    setEdicionCobrado(saldado);
    setAjustarCobro(saldado);
    setEdicionAbierta(true);
  };

  const confirmarClave = () => {
    if (!sel) return;
    const ingreso = sel;
    const clave = claveContadora;
    setClaveAbierta(false);
    setSel(null);
    setEdicionIngresoId(ingreso.id);
    setEdicionTicket(ingreso.ticket);
    setClaveEdicion(clave);
    abrirEdicion(ingreso);
  };

  const guardarEdicion = () => {
    if (!edicionIngresoId) return;
    startTransition(async () => {
      try {
        const r = await editarIngreso({
          ingreso_id: edicionIngresoId, clave_contadora: claveEdicion,
          ...genEd,
          cliente_id: clienteEdSel?.id || null,
          cliente: clienteEdSel?.nombre || busquedaClienteEd,
          motivo: motivoEdicion,
          ajustar_pagos: ajustarCobro,
        });
        toast.success(r.ajuste !== 0
          ? `Ingreso actualizado — cobro y banco ajustados en ${formatoPesos(r.ajuste)}`
          : "Ingreso actualizado");
        setEdicionAbierta(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirFacturacionDesdeDetalle = () => {
    if (!sel) return;
    setSelFacturacion(sel);
    setFacturacion({ estado_facturacion: sel.estado_facturacion, numero_factura: sel.numero_factura || "" });
    setSel(null);
  };

  const guardarFacturacion = () => {
    if (!selFacturacion) return;
    startTransition(async () => {
      try {
        await actualizarFacturacionIngreso({ ingreso_id: selFacturacion.id, ...facturacion });
        toast.success("Facturación actualizada");
        setSelFacturacion(null);
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

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[340px_1fr]">
      {/* CAUSAR INGRESO */}
      <Card className="h-fit">
        <CardHeader><CardTitle>Registrar Ingreso</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Cliente</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setNuevoCliente({ nombre: "", cedula_nit: "", empresa: "", contacto: "", correo: "", ciudad: "" }); setDialogCliente(true); }}>
                <UserPlus className="size-3.5" /> Nuevo
              </Button>
            </div>
            <Combobox
              items={clientes}
              itemToStringLabel={(c: Cliente | null) => c?.nombre ?? ""}
              value={clienteSel}
              onValueChange={v => setClienteSel((v as Cliente) ?? null)}
              inputValue={busquedaCliente}
              onInputValueChange={v => setBusquedaCliente(v ?? "")}
              openOnInputClick
            >
              <ComboboxInput placeholder="Buscar cliente..." className="w-full" showClear />
              <ComboboxContent>
                <ComboboxEmpty>No se encontró. Usa &quot;Nuevo&quot;.</ComboboxEmpty>
                <ComboboxList>
                  {(c: Cliente) => (
                    <ComboboxItem key={c.id} value={c}>
                      <div className="flex flex-col">
                        <span className="font-medium">{c.nombre} {c.empresa && <span className="text-primary">· {c.empresa}</span>}</span>
                        <span className="text-xs text-muted-foreground">{c.ciudad || "-"}</span>
                      </div>
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {clienteSel && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                <CheckCircle2 className="size-3.5 text-primary" />
                <span className="font-semibold">{clienteSel.nombre}</span>
                {clienteSel.empresa && <span className="text-muted-foreground">{clienteSel.empresa}</span>}
              </div>
            )}
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
            <Label>Tipo de Ingreso</Label>
            <Select value={nuevo.tipo_ingreso} onValueChange={v => setNuevo({ ...nuevo, tipo_ingreso: v || "" })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona (opcional)..." /></SelectTrigger>
              <SelectContent>
                {TIPOS_INGRESO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5"><Label>Concepto / Descripción</Label><Textarea rows={2} value={nuevo.concepto} onChange={e => setNuevo({ ...nuevo, concepto: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" step="any" min={0} value={nuevo.monto || ""} onChange={e => setNuevo({ ...nuevo, monto: Number(e.target.value) })} placeholder="0" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Estado de Facturación</Label>
              <Select value={nuevo.estado_facturacion} onValueChange={v => v && setNuevo({ ...nuevo, estado_facturacion: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_FACTURACION.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Número de Factura</Label><Input value={nuevo.numero_factura} onChange={e => setNuevo({ ...nuevo, numero_factura: e.target.value })} placeholder="Opcional" /></div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={nuevo.cobrarAhora} onCheckedChange={v => setNuevo({ ...nuevo, cobrarAhora: v })} />
            Cobrar ahora (entrada inmediata a la cuenta)
          </label>
          {nuevo.cobrarAhora && (
            <div className="grid gap-1.5"><Label>Cuenta donde se recibe *</Label><SelectorCuenta valor={nuevo.cuenta_id} onCambio={id => setNuevo({ ...nuevo, cuenta_id: id })} /></div>
          )}
          <Button onClick={guardarNuevo} disabled={pendiente || nuevo.monto <= 0 || (nuevo.cobrarAhora && !nuevo.cuenta_id)}>
            {nuevo.cobrarAhora ? "Registrar y Cobrar" : "Causar (pendiente por cobrar)"}
          </Button>
        </CardContent>
      </Card>

      {/* LISTA */}
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Ingresos</CardTitle>
            <p className="text-sm text-muted-foreground">Pendiente por cobrar: <span className="font-bold text-destructive">{formatoPesos(totalPendiente)}</span></p>
            <p className="max-w-xl text-xs text-muted-foreground">
              Registro manual de los ingresos de banco y caja, tal como aparecen en el extracto — es la base de la
              conciliación mensual. El dinero que recibe el equipo comercial por facturas se consulta en la pestaña
              <strong> Ingresos por Venta</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-44" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "todos")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="cobrados">Cobrados</SelectItem>
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    {ingresos.length === 0
                      ? "Aún no hay ingresos registrados."
                      : `Ningún ingreso coincide con los filtros (hay ${ingresos.length} en total).`}
                  </TableCell></TableRow>
                )}
                {lista.map(i => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => abrirDetalle(i)}>
                    <TableCell className="font-semibold">#{i.ticket}</TableCell>
                    <TableCell>{formatoFecha(i.fecha)}</TableCell>
                    <TableCell className="max-w-40 truncate">{i.cliente || "-"}</TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">{i.concepto || i.categoria || "-"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[i.categoria, i.tipo_ingreso].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm">{cuentasDeIngreso.get(i.id)?.nombres || "—"}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm">{i.numero_factura || "-"}</TableCell>
                    <TableCell className="text-right">{formatoPesos(i.monto)}</TableCell>
                    <TableCell className={`text-right font-bold ${i.saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(i.saldo)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={i.estado === "Cobrado" ? "default" : i.estado === "Abonado" ? "secondary" : "outline"}>{i.estado}</Badge>
                        {i.estado_facturacion !== "No Aplica" && (
                          <Badge variant={i.estado_facturacion === "Facturado" ? "default" : "outline"} className="w-fit text-[10px]">{i.estado_facturacion}</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Haz clic en una fila para ver el detalle, cobrar o editar.</p>
        </CardContent>
      </Card>

      {/* DIALOG NUEVA CATEGORÍA */}
      <Dialog open={dialogCategoria} onOpenChange={setDialogCategoria}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva Categoría de Ingreso</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label>Nombre *</Label>
            <Input value={nuevaCategoria} onChange={e => setNuevaCategoria(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarCategoria()} placeholder="Ej. Reembolsos" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCategoria(false)}>Cancelar</Button>
            <Button onClick={guardarCategoria} disabled={pendiente || !nuevaCategoria.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG NUEVO CLIENTE (al vuelo) */}
      <Dialog open={dialogCliente} onOpenChange={setDialogCliente}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo Cliente</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevoCliente.nombre} onChange={e => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Cédula / NIT</Label><Input value={nuevoCliente.cedula_nit} onChange={e => setNuevoCliente({ ...nuevoCliente, cedula_nit: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Empresa</Label><Input value={nuevoCliente.empresa} onChange={e => setNuevoCliente({ ...nuevoCliente, empresa: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={nuevoCliente.contacto} onChange={e => setNuevoCliente({ ...nuevoCliente, contacto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Correo</Label><Input value={nuevoCliente.correo} onChange={e => setNuevoCliente({ ...nuevoCliente, correo: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Ciudad</Label><Input value={nuevoCliente.ciudad} onChange={e => setNuevoCliente({ ...nuevoCliente, ciudad: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={guardarNuevoCliente} disabled={pendiente || !nuevoCliente.nombre.trim()}>Guardar y Seleccionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DETALLE DE SOLO LECTURA */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Ingreso #{sel?.ticket}</DialogTitle></DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{formatoFecha(sel.fecha)}</p></div>
                <div><p className="text-muted-foreground">Categoría</p><p className="font-medium">{sel.categoria || "-"}</p></div>
                <div><p className="text-muted-foreground">Cliente</p><p className="font-medium">{sel.cliente || "-"}</p></div>
                <div><p className="text-muted-foreground">Tipo de Ingreso</p><p className="font-medium">{sel.tipo_ingreso || "-"}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground">Concepto</p><p className="font-medium">{sel.concepto || "-"}</p></div>
                <div><p className="text-muted-foreground">Estado de Facturación</p><p className="font-medium">{sel.estado_facturacion}</p></div>
                <div><p className="text-muted-foreground">Número de Factura</p><p className="font-medium">{sel.numero_factura || "-"}</p></div>
              </div>

              {(pagosIngresos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Cobros anteriores</p>
                  <div className="grid gap-1 text-sm">
                    {pagosIngresos[sel.id].map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{formatoFecha(p.fecha)} {p.comentario && `— ${p.comentario}`}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="font-medium">{formatoPesos(p.monto)}</span>
                          <Button
                            variant="ghost" size="icon" className="size-7 text-destructive" title="Anular este cobro"
                            onClick={() => setCobroAnular(p)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Monto</p><p className="font-bold">{formatoPesos(sel.monto)}</p></div>
                <div><p className="text-muted-foreground">Cobrado</p><p className="font-bold">{formatoPesos(sel.cobrado)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(sel.saldo)}</p></div>
              </div>

              {(auditoriaIngresos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Historial de cambios</p>
                  <div className="grid gap-2">
                    {auditoriaIngresos[sel.id].map(a => (
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
              <Button variant="outline" onClick={abrirFacturacionDesdeDetalle}><FileText className="size-4" /> Facturación</Button>
              {sel && sel.saldo > 0 && <Button variant="outline" onClick={abrirCobroDesdeDetalle}><HandCoins className="size-4" /> Cobrar</Button>}
              <Button variant="outline" onClick={pedirClave}><Pencil className="size-4" /> Editar</Button>
              <Button variant="destructive" onClick={() => { setIngresoBorrar(sel); setSel(null); }}>
                <Trash2 className="size-4" /> Eliminar
              </Button>
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

      {/* DIALOG COBRO */}
      <Dialog open={!!selCobro} onOpenChange={o => !o && setSelCobro(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Cobrar Ingreso #{selCobro?.ticket}</DialogTitle></DialogHeader>
          {selCobro && (
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Monto</p><p className="font-bold">{formatoPesos(selCobro.monto)}</p></div>
                <div><p className="text-muted-foreground">Cobrado</p><p className="font-bold">{formatoPesos(selCobro.cobrado)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(selCobro.saldo)}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label>Monto a cobrar *</Label><Input type="number" step="any" min={0} value={cobro.monto || ""} onChange={e => setCobro({ ...cobro, monto: Number(e.target.value) })} /></div>
                <div className="grid gap-1.5"><Label>Cuenta *</Label><SelectorCuenta valor={cobro.cuenta_id} onCambio={id => setCobro({ ...cobro, cuenta_id: id })} /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={cobro.fecha} onChange={e => setCobro({ ...cobro, fecha: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Comentario</Label><Input value={cobro.comentario} onChange={e => setCobro({ ...cobro, comentario: e.target.value })} /></div>
              </div>
              <p className="text-sm">
                Saldo después del cobro:{" "}
                <span className={`font-bold ${selCobro.saldo - cobro.monto > 0 ? "text-destructive" : "text-primary"}`}>
                  {formatoPesos(selCobro.saldo - cobro.monto)}
                </span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelCobro(null)}>Cancelar</Button>
            <Button onClick={procesarCobro} disabled={pendiente || cobro.monto <= 0 || !cobro.cuenta_id}>
              {pendiente ? "Procesando..." : "Registrar Cobro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG ACTUALIZAR FACTURACIÓN (sin clave) */}
      <Dialog open={!!selFacturacion} onOpenChange={o => !o && setSelFacturacion(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Facturación — Ingreso #{selFacturacion?.ticket}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Estado de Facturación</Label>
              <Select value={facturacion.estado_facturacion} onValueChange={v => v && setFacturacion({ ...facturacion, estado_facturacion: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_FACTURACION.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Número de Factura</Label><Input value={facturacion.numero_factura} onChange={e => setFacturacion({ ...facturacion, numero_factura: e.target.value })} placeholder="Opcional" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelFacturacion(null)}>Cancelar</Button>
            <Button onClick={guardarFacturacion} disabled={pendiente}>
              {pendiente ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDICIÓN DE INGRESO */}
      <Dialog open={edicionAbierta} onOpenChange={setEdicionAbierta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar Ingreso #{edicionTicket ?? ""}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={genEd.fecha} onChange={e => setGenEd({ ...genEd, fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Categoría</Label><Combo opciones={categorias} value={genEd.categoria} onChange={v => setGenEd({ ...genEd, categoria: v })} /></div>
            </div>

            <div className="grid gap-1.5">
              <Label>Cliente</Label>
              <Combobox
                items={clientes}
                itemToStringLabel={(c: Cliente | null) => c?.nombre ?? ""}
                value={clienteEdSel}
                onValueChange={v => setClienteEdSel((v as Cliente) ?? null)}
                inputValue={busquedaClienteEd}
                onInputValueChange={v => setBusquedaClienteEd(v ?? "")}
                openOnInputClick
              >
                <ComboboxInput placeholder="Buscar cliente..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
                  <ComboboxList>
                    {(c: Cliente) => <ComboboxItem key={c.id} value={c}>{c.nombre}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            <div className="grid gap-1.5">
              <Label>Tipo de Ingreso</Label>
              <Select value={genEd.tipo_ingreso} onValueChange={v => setGenEd({ ...genEd, tipo_ingreso: v || "" })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona (opcional)..." /></SelectTrigger>
                <SelectContent>
                  {TIPOS_INGRESO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5"><Label>Concepto / Descripción</Label><Textarea rows={2} value={genEd.concepto} onChange={e => setGenEd({ ...genEd, concepto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" step="any" min={0} value={genEd.monto || ""} onChange={e => setGenEd({ ...genEd, monto: Number(e.target.value) })} /></div>

            {edicionCobrado && (
              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 p-2 text-sm">
                <Checkbox checked={ajustarCobro} onCheckedChange={v => setAjustarCobro(v === true)} className="mt-0.5" />
                <span>
                  Ya estaba cobrado por completo — ajustar también el cobro y su movimiento bancario.
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Úsalo cuando el error de digitación venía desde el registro: sin esto queda un saldo pendiente
                    por la diferencia y el Historial sigue mostrando el valor viejo.
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-1.5">
              <Label>Motivo del cambio (opcional)</Label>
              <Textarea rows={2} value={motivoEdicion} onChange={e => setMotivoEdicion(e.target.value)} placeholder="Ej. Corrección de monto por error de digitación" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicionAbierta(false)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente || genEd.monto <= 0}>
              {pendiente ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ANULAR UN COBRO */}
      <DialogoBorrado
        abierto={!!cobroAnular}
        onCerrar={() => setCobroAnular(null)}
        titulo="Anular cobro"
        etiquetaBoton="Anular cobro"
        advertencia={cobroAnular
          ? `Se elimina el cobro de ${formatoPesos(cobroAnular.monto)} y su movimiento bancario: el dinero vuelve a salir del saldo de la cuenta y el ingreso queda otra vez pendiente por ese valor.`
          : ""}
        onConfirmar={async (clave, motivo) => {
          const p = cobroAnular!;
          const r = await anularCobroIngreso({ pago_id: p.id, clave_contadora: clave, motivo });
          router.refresh();
          return `Cobro anulado — el ingreso queda ${r.estado} con saldo ${formatoPesos(r.saldo)}`;
        }}
      />

      {/* ELIMINAR EL INGRESO COMPLETO */}
      <DialogoBorrado
        abierto={!!ingresoBorrar}
        onCerrar={() => setIngresoBorrar(null)}
        titulo={`Eliminar ingreso #${ingresoBorrar?.ticket ?? ""}`}
        etiquetaBoton="Eliminar ingreso"
        advertencia={ingresoBorrar
          ? `Se elimina el ingreso completo por ${formatoPesos(ingresoBorrar.monto)}`
            + ((pagosIngresos[ingresoBorrar.id]?.length ?? 0) > 0
              ? `, sus ${pagosIngresos[ingresoBorrar.id].length} cobro(s) y los movimientos bancarios correspondientes. El saldo de la(s) cuenta(s) baja en ${formatoPesos(ingresoBorrar.cobrado)}.`
              : ". No tiene cobros registrados, así que ninguna cuenta cambia.")
          : ""}
        onConfirmar={async (clave, motivo) => {
          const i = ingresoBorrar!;
          const r = await eliminarIngreso({ ingreso_id: i.id, clave_contadora: clave, motivo });
          router.refresh();
          return `Ingreso #${r.ticket} eliminado${r.pagos > 0 ? ` con ${r.pagos} cobro(s)` : ""}`;
        }}
      />
    </div>
  );
}
