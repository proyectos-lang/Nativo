"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearIngreso, editarIngreso, cobrarIngreso, crearCategoriaIngreso } from "./acciones";
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
import { Combo } from "@/components/combo";
import { HandCoins, PlusCircle, Pencil, ShieldAlert } from "lucide-react";
import { formatoPesos, formatoFecha, type Ingreso, type PagoIngreso, type CuentaBancaria, type Bitacora } from "@/lib/tipos";

type Props = {
  ingresos: Ingreso[];
  pagosIngresos: Record<number, PagoIngreso[]>;
  cuentas: CuentaBancaria[];
  categorias: string[];
  auditoriaIngresos: Record<number, Bitacora[]>;
};

const HOY = () => new Date().toISOString().slice(0, 10);

export function IngresosCliente({ ingresos, pagosIngresos, cuentas, categorias: categoriasIniciales, auditoriaIngresos }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [categorias, setCategorias] = useState(categoriasIniciales);

  // Causación
  const [nuevo, setNuevo] = useState({
    fecha: HOY(), categoria: "", concepto: "", monto: 0, cobrarAhora: false, cuenta_id: 0,
  });

  // Nueva categoría
  const [dialogCategoria, setDialogCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");

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
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
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
  const [genEd, setGenEd] = useState({ fecha: "", categoria: "", concepto: "", monto: 0 });
  const [motivoEdicion, setMotivoEdicion] = useState("");

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ingresos.filter(i => {
      if (filtroEstado === "pendientes" && i.saldo <= 0) return false;
      if (filtroEstado === "cobrados" && i.saldo > 0) return false;
      if (!q) return true;
      return (i.concepto || "").toLowerCase().includes(q) ||
        (i.categoria || "").toLowerCase().includes(q) ||
        String(i.ticket) === q;
    });
  }, [ingresos, filtroEstado, busqueda]);

  const totalPendiente = useMemo(() => ingresos.reduce((s, i) => s + (i.saldo > 0 ? Number(i.saldo) : 0), 0), [ingresos]);

  const guardarNuevo = () => {
    startTransition(async () => {
      try {
        const r = await crearIngreso({ ...nuevo, cuenta_id: nuevo.cuenta_id || undefined });
        toast.success(`Ingreso #${r.ticket} ${nuevo.cobrarAhora ? "registrado y cobrado" : "causado (pendiente por cobrar)"}`);
        setNuevo({ fecha: HOY(), categoria: "", concepto: "", monto: 0, cobrarAhora: false, cuenta_id: 0 });
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
    setGenEd({ fecha: i.fecha, categoria: i.categoria || "", concepto: i.concepto || "", monto: Number(i.monto) || 0 });
    setMotivoEdicion("");
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
        await editarIngreso({ ingreso_id: edicionIngresoId, clave_contadora: claveEdicion, ...genEd, motivo: motivoEdicion });
        toast.success("Ingreso actualizado");
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

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[340px_1fr]">
      {/* CAUSAR INGRESO */}
      <Card className="h-fit">
        <CardHeader><CardTitle>Registrar Ingreso</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} /></div>
          <div className="grid gap-1.5">
            <Label>Categoría</Label>
            <div className="flex gap-1.5">
              <div className="flex-1"><Combo opciones={categorias} value={nuevo.categoria} onChange={v => setNuevo({ ...nuevo, categoria: v })} /></div>
              <Button type="button" variant="outline" size="icon" title="Nueva categoría" onClick={() => { setNuevaCategoria(""); setDialogCategoria(true); }}>
                <PlusCircle className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5"><Label>Concepto / Descripción</Label><Textarea rows={2} value={nuevo.concepto} onChange={e => setNuevo({ ...nuevo, concepto: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" min={0} value={nuevo.monto || ""} onChange={e => setNuevo({ ...nuevo, monto: Number(e.target.value) })} placeholder="0" /></div>
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
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle>Ingresos</CardTitle>
            <p className="text-sm text-muted-foreground">Pendiente por cobrar: <span className="font-bold text-destructive">{formatoPesos(totalPendiente)}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="w-44" placeholder="Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "pendientes")}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes</SelectItem>
                <SelectItem value="cobrados">Cobrados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(i => (
                  <TableRow key={i.id} className="cursor-pointer" onClick={() => abrirDetalle(i)}>
                    <TableCell className="font-semibold">#{i.ticket}</TableCell>
                    <TableCell>{formatoFecha(i.fecha)}</TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">{i.concepto || i.categoria || "-"}</span>
                      <span className="block text-xs text-muted-foreground">{i.categoria || ""}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatoPesos(i.monto)}</TableCell>
                    <TableCell className={`text-right font-bold ${i.saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(i.saldo)}</TableCell>
                    <TableCell><Badge variant={i.estado === "Cobrado" ? "default" : i.estado === "Abonado" ? "secondary" : "outline"}>{i.estado}</Badge></TableCell>
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

      {/* DETALLE DE SOLO LECTURA */}
      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Ingreso #{sel?.ticket}</DialogTitle></DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{formatoFecha(sel.fecha)}</p></div>
                <div><p className="text-muted-foreground">Categoría</p><p className="font-medium">{sel.categoria || "-"}</p></div>
                <div className="col-span-2"><p className="text-muted-foreground">Concepto</p><p className="font-medium">{sel.concepto || "-"}</p></div>
              </div>

              {(pagosIngresos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Cobros anteriores</p>
                  <div className="grid gap-1 text-sm">
                    {pagosIngresos[sel.id].map(p => (
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
              {sel && sel.saldo > 0 && <Button variant="outline" onClick={abrirCobroDesdeDetalle}><HandCoins className="size-4" /> Cobrar</Button>}
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
                <div className="grid gap-1.5"><Label>Monto a cobrar *</Label><Input type="number" min={0} value={cobro.monto || ""} onChange={e => setCobro({ ...cobro, monto: Number(e.target.value) })} /></div>
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

      {/* EDICIÓN DE INGRESO */}
      <Dialog open={edicionAbierta} onOpenChange={setEdicionAbierta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar Ingreso #{edicionTicket ?? ""}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={genEd.fecha} onChange={e => setGenEd({ ...genEd, fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Categoría</Label><Combo opciones={categorias} value={genEd.categoria} onChange={v => setGenEd({ ...genEd, categoria: v })} /></div>
            </div>
            <div className="grid gap-1.5"><Label>Concepto / Descripción</Label><Textarea rows={2} value={genEd.concepto} onChange={e => setGenEd({ ...genEd, concepto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" min={0} value={genEd.monto || ""} onChange={e => setGenEd({ ...genEd, monto: Number(e.target.value) })} /></div>
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
    </div>
  );
}
