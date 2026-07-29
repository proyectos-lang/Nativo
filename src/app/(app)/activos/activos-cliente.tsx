"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarActivo, darDeBajaActivo, reactivarActivo, eliminarActivo } from "./acciones";
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
import { Armchair, Boxes, Pencil, PackageMinus, RotateCcw, Trash2 } from "lucide-react";
import { formatoPesos, type Activo, type Proveedor } from "@/lib/tipos";

type Form = {
  id?: number;
  codigo: string; nombre: string; categoria: string; descripcion: string;
  cantidad: number; costo_unitario: number;
  numero_factura: string; fecha_compra: string; ubicacion: string;
  fecha_ingreso: string; area: string; marca: string; color: string; dimensiones: string;
  modelo: string; numero_serie: string; estado_actual: string; garantia_vida_util: string;
  fecha_valuacion: string; valor_actual_depreciacion: string;
  generarGasto: boolean;
};

function hoy() { return new Date().toISOString().slice(0, 10); }

const VACIO: Form = {
  codigo: "", nombre: "", categoria: "", descripcion: "",
  cantidad: 1, costo_unitario: 0,
  numero_factura: "", fecha_compra: hoy(), ubicacion: "",
  fecha_ingreso: hoy(), area: "", marca: "", color: "", dimensiones: "",
  modelo: "", numero_serie: "", estado_actual: "", garantia_vida_util: "",
  fecha_valuacion: "", valor_actual_depreciacion: "",
  generarGasto: true,
};

type FormBaja = { motivo: string; fecha_baja: string; valor_baja: number; observaciones_baja: string };
const BAJA_VACIA: FormBaja = { motivo: "", fecha_baja: hoy(), valor_baja: 0, observaciones_baja: "" };

export function ActivosCliente({ activos, proveedores, categorias, ubicaciones, areas, estadosActuales, motivosBaja }: {
  activos: Activo[]; proveedores: Proveedor[]; categorias: string[]; ubicaciones: string[]; areas: string[]; estadosActuales: string[]; motivosBaja: string[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<string>("Activo");

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(VACIO);
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");

  const [bajaId, setBajaId] = useState<number | null>(null);
  const [bajaForm, setBajaForm] = useState<FormBaja>(BAJA_VACIA);

  const kpis = useMemo(() => {
    const vigentes = activos.filter(a => a.estado === "Activo");
    const valorTotal = vigentes.reduce((s, a) => s + (Number(a.valor_total) || 0), 0);
    return { vigentes: vigentes.length, valorTotal, bajas: activos.length - vigentes.length };
  }, [activos]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return activos.filter(a => {
      if (filtroEstado !== "Todos" && a.estado !== filtroEstado) return false;
      if (!q) return true;
      return a.nombre.toLowerCase().includes(q) || (a.codigo || "").toLowerCase().includes(q) || (a.categoria || "").toLowerCase().includes(q) ||
        (a.marca || "").toLowerCase().includes(q) || (a.numero_serie || "").toLowerCase().includes(q) || (a.area || "").toLowerCase().includes(q);
    });
  }, [activos, busqueda, filtroEstado]);

  const abrir = (a?: Activo) => {
    if (a) {
      setForm({
        id: a.id, codigo: a.codigo || "", nombre: a.nombre, categoria: a.categoria || "", descripcion: a.descripcion || "",
        cantidad: a.cantidad, costo_unitario: a.costo_unitario,
        numero_factura: a.numero_factura || "", fecha_compra: a.fecha_compra?.slice(0, 10) || hoy(), ubicacion: a.ubicacion || "",
        fecha_ingreso: a.fecha_ingreso?.slice(0, 10) || "", area: a.area || "", marca: a.marca || "", color: a.color || "",
        dimensiones: a.dimensiones || "", modelo: a.modelo || "", numero_serie: a.numero_serie || "",
        estado_actual: a.estado_actual || "", garantia_vida_util: a.garantia_vida_util || "",
        fecha_valuacion: a.fecha_valuacion?.slice(0, 10) || "",
        valor_actual_depreciacion: a.valor_actual_depreciacion != null ? String(a.valor_actual_depreciacion) : "",
        generarGasto: true,
      });
      setProveedorSel(proveedores.find(p => p.id === a.proveedor_id) || null);
      setBusquedaProveedor(a.proveedor || "");
    } else {
      setForm(VACIO);
      setProveedorSel(null);
      setBusquedaProveedor("");
    }
    setAbierto(true);
  };

  const valorTotalForm = (Number(form.cantidad) || 0) * (Number(form.costo_unitario) || 0);

  const guardar = () => {
    startTransition(async () => {
      try {
        await guardarActivo({
          ...form,
          valor_actual_depreciacion: form.valor_actual_depreciacion !== "" ? Number(form.valor_actual_depreciacion) : null,
          proveedor_id: proveedorSel?.id || null,
          proveedor: proveedorSel?.nombre || busquedaProveedor.trim() || undefined,
        });
        toast.success(form.id ? "Activo actualizado" : "Activo registrado");
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirBaja = (a: Activo) => {
    setBajaId(a.id);
    setBajaForm(BAJA_VACIA);
  };

  const confirmarBaja = () => {
    if (!bajaId) return;
    startTransition(async () => {
      try {
        await darDeBajaActivo(bajaId, bajaForm);
        toast.success("Activo dado de baja");
        setBajaId(null);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const reactivar = (a: Activo) => {
    if (!confirm(`¿Reactivar "${a.nombre}"? Volverá a la lista de activos vigentes.`)) return;
    startTransition(async () => {
      try {
        await reactivarActivo(a.id);
        toast.success("Activo reactivado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const eliminar = (a: Activo) => {
    if (!confirm(`¿Eliminar definitivamente "${a.nombre}"? Esta acción no se puede deshacer.`)) return;
    startTransition(async () => {
      try {
        await eliminarActivo(a.id);
        toast.success("Activo eliminado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const campo = (
    k: "codigo" | "nombre" | "descripcion" | "numero_factura" | "marca" | "color" | "dimensiones" | "modelo" | "numero_serie" | "garantia_vida_util",
    label: string, className?: string,
  ) => (
    <div className={`grid gap-1.5 ${className || ""}`}>
      <Label>{label}</Label>
      <Input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Armchair className="size-5" /> Activos Fijos</h2>
          <p className="text-sm text-muted-foreground">Mobiliario y equipos de la empresa — no es mercancía para vender.</p>
        </div>
        <Button onClick={() => abrir()}><Boxes className="size-4" /> Nuevo Activo</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Activos vigentes</p>
          <p className="text-2xl font-bold">{kpis.vigentes}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Valor total (costo)</p>
          <p className="text-2xl font-bold">{formatoPesos(kpis.valorTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Vendidos / dados de baja</p>
          <p className="text-2xl font-bold">{kpis.bajas}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <Input className="w-64" placeholder="Buscar por nombre, código, categoría..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              <Select value={filtroEstado} onValueChange={v => v && setFiltroEstado(v)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Activo">Vigentes</SelectItem>
                  <SelectItem value="Vendido">Vendidos</SelectItem>
                  <SelectItem value="Dado de Baja">Dados de baja</SelectItem>
                  <SelectItem value="Todos">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">{lista.length} de {activos.length}</p>
          </div>

          <div className="max-h-[560px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Valor compra</TableHead>
                  <TableHead className="text-right">Valor actual</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(a => (
                  <TableRow key={a.id} className={a.estado === "Activo" ? "" : "opacity-70"}>
                    <TableCell className="font-medium">
                      {a.codigo ? <span className="text-muted-foreground">{a.codigo} — </span> : null}{a.nombre}
                      {a.marca ? <span className="block text-xs text-muted-foreground">{[a.marca, a.modelo].filter(Boolean).join(" · ")}</span> : null}
                    </TableCell>
                    <TableCell>{a.area || "-"}</TableCell>
                    <TableCell>{a.categoria || "-"}</TableCell>
                    <TableCell>{a.ubicacion || "-"}</TableCell>
                    <TableCell className="text-right">{a.cantidad}</TableCell>
                    <TableCell className="text-right">{formatoPesos(a.valor_total)}</TableCell>
                    <TableCell className="text-right">{a.valor_actual_depreciacion != null ? formatoPesos(a.valor_actual_depreciacion) : "-"}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm">{a.numero_factura || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={a.estado === "Activo" ? "default" : a.estado === "Vendido" ? "secondary" : "destructive"}>{a.estado}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.estado === "Activo" ? (
                        <>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => abrir(a)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" title="Dar de baja" onClick={() => abrirBaja(a)}><PackageMinus className="size-4" /></Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" title="Reactivar" onClick={() => reactivar(a)}><RotateCcw className="size-4" /></Button>
                      )}
                      {!a.gasto_id && (
                        <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar" onClick={() => eliminar(a)}><Trash2 className="size-4" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG NUEVO / EDITAR */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar Activo" : "Nuevo Activo"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Identificación</p>
            <div className="grid grid-cols-2 gap-3">
              {campo("nombre", "Artículo *")}
              {campo("marca", "Marca")}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {campo("modelo", "Modelo")}
              {campo("numero_serie", "N° de serie / referencia")}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {campo("color", "Color")}
              {campo("dimensiones", "Dimensiones")}
              {campo("codigo", "Código / placa interna")}
            </div>
            <div className="grid gap-1.5">
              <Label>Descripción</Label>
              <Textarea rows={2} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            </div>

            <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">Clasificación</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Área</Label>
                <Combo opciones={areas} value={form.area} onChange={v => setForm({ ...form, area: v })} placeholder="Escriba o elija..." />
              </div>
              <div className="grid gap-1.5">
                <Label>Categoría</Label>
                <Combo opciones={categorias} value={form.categoria} onChange={v => setForm({ ...form, categoria: v })} placeholder="Escriba o elija..." />
              </div>
              <div className="grid gap-1.5">
                <Label>Ubicación</Label>
                <Combo opciones={ubicaciones} value={form.ubicacion} onChange={v => setForm({ ...form, ubicacion: v })} placeholder="Escriba o elija..." />
              </div>
              <div className="grid gap-1.5">
                <Label>Estado actual (condición)</Label>
                <Combo opciones={estadosActuales} value={form.estado_actual} onChange={v => setForm({ ...form, estado_actual: v })} placeholder="Escriba o elija..." />
              </div>
            </div>

            <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">Proveedor y compra</p>
            <div className="grid gap-1.5">
              <Label>Proveedor</Label>
              <Combobox
                items={proveedores}
                itemToStringLabel={(p: Proveedor | null) => p?.nombre ?? ""}
                value={proveedorSel}
                onValueChange={v => setProveedorSel((v as Proveedor) ?? null)}
                inputValue={busquedaProveedor}
                onInputValueChange={v => setBusquedaProveedor(v ?? "")}
                openOnInputClick
              >
                <ComboboxInput placeholder="Buscar proveedor o escribir uno nuevo..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>No se encontró — se usará el texto escrito.</ComboboxEmpty>
                  <ComboboxList>
                    {(p: Proveedor) => <ComboboxItem key={p.id} value={p}>{p.nombre}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {campo("numero_factura", "Número de factura")}
              <div className="grid gap-1.5">
                <Label>Fecha de ingreso</Label>
                <Input type="date" value={form.fecha_ingreso} onChange={e => setForm({ ...form, fecha_ingreso: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Fecha de adquisición</Label>
                <Input type="date" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Cantidad</Label>
                <Input type="number" min={1} value={form.cantidad} onChange={e => setForm({ ...form, cantidad: Number(e.target.value) || 1 })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Valor de compra (unit.)</Label>
                <Input type="number" min={0} value={form.costo_unitario} onChange={e => setForm({ ...form, costo_unitario: Number(e.target.value) || 0 })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Valor total</Label>
                <Input value={formatoPesos(valorTotalForm)} disabled />
              </div>
            </div>

            <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">Garantía y depreciación</p>
            <div className="grid grid-cols-3 gap-3">
              {campo("garantia_vida_util", "Garantía / vida útil")}
              <div className="grid gap-1.5">
                <Label>Fecha de valoración</Label>
                <Input type="date" value={form.fecha_valuacion} onChange={e => setForm({ ...form, fecha_valuacion: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Valor actual con depreciación</Label>
                <Input type="number" min={0} value={form.valor_actual_depreciacion} onChange={e => setForm({ ...form, valor_actual_depreciacion: e.target.value })} placeholder="Opcional" />
              </div>
            </div>

            {!form.id && (
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <Switch checked={form.generarGasto} onCheckedChange={v => setForm({ ...form, generarGasto: v })} />
                Generar Gasto automático en Financiero por esta compra
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente || !form.nombre.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG DAR DE BAJA */}
      <Dialog open={bajaId !== null} onOpenChange={o => !o && setBajaId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Dar de baja el activo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Motivo *</Label>
              <Combo opciones={motivosBaja} value={bajaForm.motivo} onChange={v => setBajaForm({ ...bajaForm, motivo: v })} placeholder="Escriba o elija..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={bajaForm.fecha_baja} onChange={e => setBajaForm({ ...bajaForm, fecha_baja: e.target.value })} />
            </div>
            {bajaForm.motivo === "Vendido" && (
              <div className="grid gap-1.5">
                <Label>Valor de venta</Label>
                <Input type="number" min={0} value={bajaForm.valor_baja} onChange={e => setBajaForm({ ...bajaForm, valor_baja: Number(e.target.value) || 0 })} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Observaciones</Label>
              <Textarea rows={2} value={bajaForm.observaciones_baja} onChange={e => setBajaForm({ ...bajaForm, observaciones_baja: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBajaId(null)}>Cancelar</Button>
            <Button onClick={confirmarBaja} disabled={pendiente || !bajaForm.motivo.trim()}>Confirmar baja</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
