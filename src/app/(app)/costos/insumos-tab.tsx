"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  guardarInsumo, eliminarInsumo, movimientoInsumo, propagarCostoInsumo, crearProveedorInsumo,
  type DatosInsumo,
} from "./acciones";
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
import { Combo } from "@/components/combo";
import { Plus, Trash2, Pencil, ArrowDownToLine, ArrowUpFromLine, Scale, Truck, AlertTriangle } from "lucide-react";
import { formatoPesos, formatoFecha, type Insumo, type MovimientoInsumo, type Proveedor, type TipoMovimientoInsumo } from "@/lib/tipos";

type Props = {
  insumos: Insumo[];
  movimientos: MovimientoInsumo[];
  proveedores: Proveedor[];
  categorias: string[];
  unidades: string[];
};

const FICHA_VACIA: DatosInsumo = {
  nombre: "", codigo: "", categoria: "", unidad_medida: "Unidad",
  stock_minimo: 0, proveedor_id: null, notas: "", activo: true, costo_inicial: 0,
};

type FormMov = {
  tipo: TipoMovimientoInsumo;
  cantidad: number;
  costo_unitario: number;
  fecha: string;
  numero_factura: string;
  referencia: string;
  motivo: string;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

const MOV_VACIO: FormMov = {
  tipo: "entrada", cantidad: 0, costo_unitario: 0, fecha: "",
  numero_factura: "", referencia: "", motivo: "",
};

export function InsumosTab({ insumos, movimientos, proveedores, categorias, unidades }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [soloBajos, setSoloBajos] = useState(false);

  // Ficha
  const [dialogFicha, setDialogFicha] = useState(false);
  const [ficha, setFicha] = useState<DatosInsumo>(FICHA_VACIA);

  // Movimiento
  const [dialogMov, setDialogMov] = useState(false);
  const [insumoMov, setInsumoMov] = useState<Insumo | null>(null);
  const [formMov, setFormMov] = useState<FormMov>(MOV_VACIO);

  // Proveedor (compartido por la ficha y por la entrada)
  const [listaProv, setListaProv] = useState<Proveedor[]>(proveedores);
  const [provSel, setProvSel] = useState<Proveedor | null>(null);
  const [busqProv, setBusqProv] = useState("");
  const [dialogProv, setDialogProv] = useState(false);
  const [nuevoProv, setNuevoProv] = useState({ nombre: "", tipo: "", nit: "", contacto: "" });

  // Movimientos de un insumo
  const [insumoHist, setInsumoHist] = useState<Insumo | null>(null);

  const bajo = (i: Insumo) => Number(i.stock_minimo) > 0 && Number(i.existencia) < Number(i.stock_minimo);

  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return insumos.filter(i => {
      if (categoria !== "todas" && (i.categoria || "") !== categoria) return false;
      if (soloBajos && !bajo(i)) return false;
      if (!q) return true;
      return i.nombre.toLowerCase().includes(q)
        || (i.codigo || "").toLowerCase().includes(q)
        || (i.categoria || "").toLowerCase().includes(q);
    });
  }, [insumos, busqueda, categoria, soloBajos]);

  const kpis = useMemo(() => ({
    total: insumos.length,
    activos: insumos.filter(i => i.activo).length,
    bajos: insumos.filter(bajo).length,
    valorizado: insumos.reduce((s, i) => s + (Number(i.existencia) || 0) * (Number(i.costo_unitario) || 0), 0),
  }), [insumos]);

  const movsDe = useMemo(() => {
    if (!insumoHist) return [];
    return movimientos.filter(m => m.insumo_id === insumoHist.id);
  }, [movimientos, insumoHist]);

  const abrirNuevo = () => {
    setFicha({ ...FICHA_VACIA });
    setProvSel(null); setBusqProv("");
    setDialogFicha(true);
  };

  const abrirEdicion = (i: Insumo) => {
    setFicha({
      id: i.id, nombre: i.nombre, codigo: i.codigo || "", categoria: i.categoria || "",
      unidad_medida: i.unidad_medida, stock_minimo: Number(i.stock_minimo) || 0,
      proveedor_id: i.proveedor_id, notas: i.notas || "", activo: i.activo,
    });
    const p = listaProv.find(x => x.id === i.proveedor_id) || null;
    setProvSel(p); setBusqProv(p?.nombre || "");
    setDialogFicha(true);
  };

  const guardarFicha = () => {
    startTransition(async () => {
      try {
        await guardarInsumo({ ...ficha, proveedor_id: provSel?.id ?? null });
        toast.success(ficha.id ? "Insumo actualizado" : "Insumo creado");
        setDialogFicha(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const borrar = (i: Insumo) => {
    if (!confirm(`¿Eliminar el insumo "${i.nombre}"? Sus movimientos quedan en el historial.`)) return;
    startTransition(async () => {
      try {
        await eliminarInsumo(i.id);
        toast.success("Insumo eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirMov = (i: Insumo, tipo: TipoMovimientoInsumo) => {
    setInsumoMov(i);
    setFormMov({
      ...MOV_VACIO,
      tipo,
      fecha: hoyISO(),
      // En un ajuste se escribe la existencia física; se parte de la actual.
      cantidad: tipo === "ajuste" ? Number(i.existencia) || 0 : 0,
      costo_unitario: tipo === "entrada" ? Number(i.ultimo_costo) || Number(i.costo_unitario) || 0 : 0,
    });
    const p = listaProv.find(x => x.id === i.proveedor_id) || null;
    setProvSel(p); setBusqProv(p?.nombre || "");
    setDialogMov(true);
  };

  const guardarMov = () => {
    if (!insumoMov) return;
    startTransition(async () => {
      try {
        const r = await movimientoInsumo({
          insumo_id: insumoMov.id,
          tipo: formMov.tipo,
          cantidad: Number(formMov.cantidad),
          costo_unitario: formMov.tipo === "entrada" ? Number(formMov.costo_unitario) : null,
          fecha: formMov.fecha || undefined,
          proveedor_id: formMov.tipo === "entrada" ? provSel?.id ?? null : null,
          numero_factura: formMov.numero_factura,
          referencia: formMov.referencia,
          motivo: formMov.motivo,
        });
        // El costo promedio cambió: se refleja en las recetas que usan el insumo.
        const prop = formMov.tipo === "entrada" ? await propagarCostoInsumo(insumoMov.id) : { recetas: 0 };
        toast.success(
          `Saldo de ${r.nombre}: ${r.existencia} ${r.unidad_medida} — costo ${formatoPesos(r.costo_unitario)}`
          + (prop.recetas > 0 ? ` · ${prop.recetas} receta(s) actualizada(s)` : ""),
        );
        setDialogMov(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const crearProv = () => {
    startTransition(async () => {
      try {
        const p = await crearProveedorInsumo(nuevoProv);
        const fila = { id: p.id, nombre: p.nombre, nit: null, tipo: null, contacto: null, correo: null, direccion: null, ciudad: null, departamento: null } as Proveedor;
        setListaProv(prev => [...prev, fila].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setProvSel(fila); setBusqProv(fila.nombre);
        setDialogProv(false);
        toast.success("Proveedor creado");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const selectorProveedor = (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Proveedor</Label>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs"
          onClick={() => { setNuevoProv({ nombre: busqProv.trim(), tipo: "", nit: "", contacto: "" }); setDialogProv(true); }}>
          <Truck className="size-3.5" /> Nuevo
        </Button>
      </div>
      <Combobox
        items={listaProv}
        itemToStringLabel={(p: Proveedor | null) => p?.nombre ?? ""}
        value={provSel}
        onValueChange={v => setProvSel((v as Proveedor) ?? null)}
        inputValue={busqProv}
        onInputValueChange={v => setBusqProv(v ?? "")}
        openOnInputClick
      >
        <ComboboxInput placeholder="Opcional — buscar o crear..." className="w-full" showClear />
        <ComboboxContent>
          <ComboboxEmpty>No se encontró. Usa &quot;Nuevo&quot;.</ComboboxEmpty>
          <ComboboxList>
            {(p: Proveedor) => <ComboboxItem key={p.id} value={p}>{p.nombre}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );

  const tituloMov = formMov.tipo === "entrada" ? "Entrada de insumo"
    : formMov.tipo === "salida" ? "Salida de insumo" : "Ajuste por conteo físico";

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Insumos</p>
          <p className="text-2xl font-bold">{kpis.total}</p>
          <p className="text-xs text-muted-foreground">{kpis.activos} activo(s)</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Bajo el mínimo</p>
          <p className={`text-2xl font-bold ${kpis.bajos > 0 ? "text-destructive" : ""}`}>{kpis.bajos}</p>
        </CardContent></Card>
        <Card className="sm:col-span-2"><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Inventario valorizado</p>
          <p className="text-2xl font-bold">{formatoPesos(kpis.valorizado)}</p>
          <p className="text-xs text-muted-foreground">Existencia × costo promedio</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-56" placeholder="Buscar insumo, código..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <Select value={categoria} onValueChange={v => v && setCategoria(v)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las categorías</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={soloBajos} onCheckedChange={setSoloBajos} />
                Solo bajo el mínimo
              </label>
            </div>
            <Button onClick={abrirNuevo}><Plus className="size-4" /> Nuevo insumo</Button>
          </div>

          <div className="tabla-scroll max-h-[560px] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Existencia</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Costo prom.</TableHead>
                  <TableHead className="text-right">Último costo</TableHead>
                  <TableHead className="text-right">Valorizado</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    {insumos.length === 0
                      ? "Aún no hay insumos. Crea el primero con “Nuevo insumo”."
                      : "Ningún insumo coincide con el filtro."}
                  </TableCell></TableRow>
                )}
                {filas.map(i => (
                  <TableRow key={i.id} className={i.activo ? "" : "opacity-60"}>
                    <TableCell className="max-w-64">
                      <span className="block truncate font-medium">{i.nombre}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.codigo || "sin código"}{!i.activo && " · inactivo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{i.categoria || "—"}</TableCell>
                    <TableCell className="text-sm">{i.unidad_medida}</TableCell>
                    <TableCell className={`text-right font-semibold ${bajo(i) ? "text-destructive" : ""}`}>
                      {Number(i.existencia)}
                      {bajo(i) && <AlertTriangle className="ml-1 inline size-3.5" />}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{Number(i.stock_minimo) || "—"}</TableCell>
                    <TableCell className="text-right">{formatoPesos(i.costo_unitario)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatoPesos(i.ultimo_costo)}</TableCell>
                    <TableCell className="text-right">{formatoPesos((Number(i.existencia) || 0) * (Number(i.costo_unitario) || 0))}</TableCell>
                    <TableCell className="max-w-40 truncate text-sm">{i.proveedor || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" title="Entrada" onClick={() => abrirMov(i, "entrada")}><ArrowDownToLine className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Salida" onClick={() => abrirMov(i, "salida")}><ArrowUpFromLine className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Ajuste por conteo" onClick={() => abrirMov(i, "ajuste")}><Scale className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Movimientos" onClick={() => setInsumoHist(i)}>
                        <span className="text-xs font-semibold">{movimientos.filter(m => m.insumo_id === i.id).length || "·"}</span>
                      </Button>
                      <Button variant="ghost" size="icon" title="Editar ficha" onClick={() => abrirEdicion(i)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar" onClick={() => borrar(i)}><Trash2 className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {filas.length} insumo(s). El <strong>costo promedio</strong> se recalcula solo en cada entrada y es el que usan las recetas;
            para cambiarlo registra una entrada, no lo edites a mano.
          </p>
        </CardContent>
      </Card>

      {/* MOVIMIENTOS RECIENTES */}
      <Card>
        <CardContent className="grid gap-2 pt-2">
          <p className="text-sm font-semibold">Movimientos recientes</p>
          <div className="tabla-scroll max-h-80 rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Proveedor / factura</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Sin movimientos.</TableCell></TableRow>
                )}
                {movimientos.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{formatoFecha(m.fecha)}</TableCell>
                    <TableCell><Badge variant={m.tipo === "entrada" ? "default" : m.tipo === "salida" ? "secondary" : "outline"}>{m.tipo}</Badge></TableCell>
                    <TableCell className="max-w-52 truncate">{m.insumo}</TableCell>
                    <TableCell className={`text-right font-semibold ${Number(m.cantidad) < 0 ? "text-destructive" : ""}`}>{Number(m.cantidad)}</TableCell>
                    <TableCell className="text-right">{m.costo_unitario != null ? formatoPesos(m.costo_unitario) : "—"}</TableCell>
                    <TableCell className="text-right">{Number(m.saldo_despues)}</TableCell>
                    <TableCell className="max-w-44 truncate text-sm">
                      {m.proveedor || "—"}{m.numero_factura ? ` · ${m.numero_factura}` : ""}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-sm">{m.motivo || m.referencia || "—"}</TableCell>
                    <TableCell className="text-sm">{m.usuario || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG FICHA */}
      <Dialog open={dialogFicha} onOpenChange={setDialogFicha}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{ficha.id ? "Editar insumo" : "Nuevo insumo"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Nombre *</Label>
              <Input value={ficha.nombre} onChange={e => setFicha({ ...ficha, nombre: e.target.value })} placeholder="Tela algodón jersey 30/1 blanca" />
            </div>
            <div className="grid gap-1.5">
              <Label>Código</Label>
              <Input value={ficha.codigo || ""} onChange={e => setFicha({ ...ficha, codigo: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="grid gap-1.5">
              <Label>Categoría</Label>
              <Combo opciones={categorias} value={ficha.categoria || ""} onChange={v => setFicha({ ...ficha, categoria: v })} placeholder="Telas, Hilos..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Unidad de medida *</Label>
              <Combo opciones={unidades} value={ficha.unidad_medida || ""} onChange={v => setFicha({ ...ficha, unidad_medida: v })} placeholder="Metro, Unidad..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Stock mínimo</Label>
              <Input type="number" step="any" min={0} value={ficha.stock_minimo || ""} onChange={e => setFicha({ ...ficha, stock_minimo: Number(e.target.value) })} placeholder="0" />
            </div>
            {selectorProveedor}
            {!ficha.id && (
              <div className="grid gap-1.5">
                <Label>Costo unitario inicial</Label>
                <Input type="number" step="any" min={0} value={ficha.costo_inicial || ""} onChange={e => setFicha({ ...ficha, costo_inicial: Number(e.target.value) })} placeholder="0" />
                <p className="text-xs text-muted-foreground">Después el costo lo calcula cada entrada (promedio ponderado).</p>
              </div>
            )}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={ficha.notas || ""} onChange={e => setFicha({ ...ficha, notas: e.target.value })} placeholder="Referencia del proveedor, ancho de la tela, etc." />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
              <Switch checked={ficha.activo !== false} onCheckedChange={v => setFicha({ ...ficha, activo: v })} />
              Activo (aparece en el selector de materiales de las recetas)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogFicha(false)}>Cancelar</Button>
            <Button onClick={guardarFicha} disabled={pendiente || !ficha.nombre.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG MOVIMIENTO */}
      <Dialog open={dialogMov} onOpenChange={setDialogMov}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{tituloMov}</DialogTitle></DialogHeader>
          {insumoMov && (
            <div className="grid gap-3">
              <div className="rounded-md border bg-muted/40 p-2 text-sm">
                <p className="font-medium">{insumoMov.nombre}</p>
                <p className="text-muted-foreground">
                  Existencia actual: <strong>{Number(insumoMov.existencia)} {insumoMov.unidad_medida}</strong>
                  {" · "}Costo promedio: <strong>{formatoPesos(insumoMov.costo_unitario)}</strong>
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Fecha</Label>
                  <Input type="date" value={formMov.fecha} onChange={e => setFormMov({ ...formMov, fecha: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>{formMov.tipo === "ajuste" ? "Existencia física contada *" : "Cantidad *"}</Label>
                  <Input type="number" step="any" min={0} value={formMov.cantidad || ""} onChange={e => setFormMov({ ...formMov, cantidad: Number(e.target.value) })} placeholder="0" />
                </div>

                {formMov.tipo === "entrada" && (
                  <>
                    <div className="grid gap-1.5">
                      <Label>Costo unitario</Label>
                      <Input type="number" step="any" min={0} value={formMov.costo_unitario || ""} onChange={e => setFormMov({ ...formMov, costo_unitario: Number(e.target.value) })} placeholder="0" />
                      <p className="text-xs text-muted-foreground">En blanco o cero entra al costo promedio actual sin alterarlo.</p>
                    </div>
                    {selectorProveedor}
                    <div className="grid gap-1.5">
                      <Label>Número de factura</Label>
                      <Input value={formMov.numero_factura} onChange={e => setFormMov({ ...formMov, numero_factura: e.target.value })} placeholder="Opcional" />
                    </div>
                  </>
                )}

                <div className={`grid gap-1.5 ${formMov.tipo === "entrada" ? "" : "sm:col-span-2"}`}>
                  <Label>{formMov.tipo === "entrada" ? "Referencia" : "Motivo *"}</Label>
                  {formMov.tipo === "entrada"
                    ? <Input value={formMov.referencia} onChange={e => setFormMov({ ...formMov, referencia: e.target.value })} placeholder="Opcional" />
                    : <Input value={formMov.motivo} onChange={e => setFormMov({ ...formMov, motivo: e.target.value })}
                        placeholder={formMov.tipo === "salida" ? "Consumo en producción, baja, muestra..." : "Diferencia de conteo"} />}
                </div>
              </div>

              {formMov.tipo === "ajuste" && (
                <p className="rounded-md border bg-muted/40 p-2 text-sm">
                  Diferencia por registrar:{" "}
                  <strong className={Number(formMov.cantidad) - Number(insumoMov.existencia) < 0 ? "text-destructive" : ""}>
                    {(Number(formMov.cantidad) - Number(insumoMov.existencia)).toFixed(2)} {insumoMov.unidad_medida}
                  </strong>
                  . Un ajuste de conteo no cambia el costo promedio.
                </p>
              )}
              {formMov.tipo === "salida" && Number(formMov.cantidad) > Number(insumoMov.existencia) && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
                  Solo hay {Number(insumoMov.existencia)} {insumoMov.unidad_medida}: la salida quedaría en negativo y será rechazada.
                </p>
              )}
              {formMov.tipo === "entrada" && Number(formMov.costo_unitario) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total de la entrada: {formatoPesos(Number(formMov.cantidad) * Number(formMov.costo_unitario))}.
                  El costo promedio se recalculará y se aplicará a las recetas que usen este insumo.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMov(false)}>Cancelar</Button>
            <Button onClick={guardarMov} disabled={pendiente || !insumoMov}>
              {formMov.tipo === "entrada" ? "Registrar entrada" : formMov.tipo === "salida" ? "Registrar salida" : "Aplicar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG HISTORIAL DE UN INSUMO */}
      <Dialog open={!!insumoHist} onOpenChange={o => !o && setInsumoHist(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Movimientos — {insumoHist?.nombre}</DialogTitle></DialogHeader>
          <div className="tabla-scroll max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movsDe.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Este insumo no tiene movimientos recientes.
                  </TableCell></TableRow>
                )}
                {movsDe.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{formatoFecha(m.fecha)}</TableCell>
                    <TableCell><Badge variant={m.tipo === "entrada" ? "default" : m.tipo === "salida" ? "secondary" : "outline"}>{m.tipo}</Badge></TableCell>
                    <TableCell className={`text-right font-semibold ${Number(m.cantidad) < 0 ? "text-destructive" : ""}`}>{Number(m.cantidad)}</TableCell>
                    <TableCell className="text-right">{m.costo_unitario != null ? formatoPesos(m.costo_unitario) : "—"}</TableCell>
                    <TableCell className="text-right">{Number(m.saldo_despues)}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">
                      {[m.proveedor, m.numero_factura, m.motivo, m.referencia].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setInsumoHist(null)}>Cerrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG NUEVO PROVEEDOR */}
      <Dialog open={dialogProv} onOpenChange={setDialogProv}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo proveedor</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevoProv.nombre} onChange={e => setNuevoProv({ ...nuevoProv, nombre: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Tipo</Label><Input value={nuevoProv.tipo} onChange={e => setNuevoProv({ ...nuevoProv, tipo: e.target.value })} placeholder="Telas, Insumos..." /></div>
            <div className="grid gap-1.5"><Label>NIT</Label><Input value={nuevoProv.nit} onChange={e => setNuevoProv({ ...nuevoProv, nit: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={nuevoProv.contacto} onChange={e => setNuevoProv({ ...nuevoProv, contacto: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProv(false)}>Cancelar</Button>
            <Button onClick={crearProv} disabled={pendiente || !nuevoProv.nombre.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
