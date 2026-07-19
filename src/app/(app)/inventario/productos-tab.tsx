"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarProducto, cambiarEstadoProducto, type DatosProducto } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combo } from "@/components/combo";
import { Pencil, PackagePlus, Archive, ArchiveRestore } from "lucide-react";
import { formatoPesos, type Producto } from "@/lib/tipos";

type Props = {
  productos: Producto[];
  maestros: Record<string, string[]>;
};

type FormProducto = {
  id?: number;
  nombre: string; sku: string; codigo_barras: string;
  categoria: string; subcategoria: string; sexo: string; talla: string; color: string; manga: string;
  unidad_medida: string;
  precio_compra: number; precio_venta_antes_iva: number; iva_porcentaje: number;
  es_servicio: boolean; controla_inventario: boolean;
  fecha_vencimiento: string; stock_minimo: number; stock_maximo: number;
};

const FORM_VACIO: FormProducto = {
  nombre: "", sku: "", codigo_barras: "",
  categoria: "", subcategoria: "", sexo: "", talla: "", color: "", manga: "",
  unidad_medida: "Unidad",
  precio_compra: 0, precio_venta_antes_iva: 0, iva_porcentaje: 0,
  es_servicio: false, controla_inventario: true,
  fecha_vencimiento: "", stock_minimo: 0, stock_maximo: 0,
};

export function ProductosTab({ productos, maestros }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("inventario");
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<FormProducto>(FORM_VACIO);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return productos.filter(p => {
      if (filtroTipo === "inventario" && !p.controla_inventario) return false;
      if (filtroTipo === "servicios" && !p.es_servicio) return false;
      if (filtroTipo === "sin_enrolar" && (p.controla_inventario || p.es_servicio)) return false;
      if (!q) return true;
      return p.nombre.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.categoria || "").toLowerCase().includes(q) ||
        (p.codigo_barras || "").toLowerCase().includes(q);
    });
  }, [productos, busqueda, filtroTipo]);

  const precioFinal = Math.round((Number(form.precio_venta_antes_iva) || 0) * (1 + (Number(form.iva_porcentaje) || 0) / 100) * 100) / 100;

  const abrir = (p?: Producto) => {
    setForm(p ? {
      id: p.id,
      nombre: p.nombre, sku: p.sku || "", codigo_barras: p.codigo_barras || "",
      categoria: p.categoria || "", subcategoria: p.subcategoria || "", sexo: p.sexo || "",
      talla: p.talla || "", color: p.color || "", manga: p.manga || "",
      unidad_medida: p.unidad_medida || "Unidad",
      precio_compra: Number(p.precio_compra) || 0,
      precio_venta_antes_iva: Number(p.precio_venta_antes_iva) || 0,
      iva_porcentaje: Number(p.iva_porcentaje) || 0,
      es_servicio: p.es_servicio, controla_inventario: p.controla_inventario,
      fecha_vencimiento: p.fecha_vencimiento || "",
      stock_minimo: Number(p.stock_minimo) || 0,
      stock_maximo: p.stock_maximo != null ? Number(p.stock_maximo) : 0,
    } : { ...FORM_VACIO });
    setAbierto(true);
  };

  const guardar = () => {
    startTransition(async () => {
      try {
        const datos: DatosProducto = {
          ...form,
          stock_maximo: form.stock_maximo > 0 ? form.stock_maximo : null,
        };
        await guardarProducto(datos);
        toast.success(form.id ? "Producto actualizado" : "Producto creado");
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const alternarEstado = (p: Producto) => {
    const nuevo = p.estado === "Activo" ? "Descontinuado" : "Activo";
    if (nuevo === "Descontinuado" && !confirm(`¿Descontinuar "${p.nombre}"?`)) return;
    startTransition(async () => {
      try {
        await cambiarEstadoProducto(p.id, nuevo);
        toast.success(nuevo === "Activo" ? "Producto reactivado" : "Producto descontinuado");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{productos.length} productos en el catálogo.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-56" placeholder="Buscar por SKU, nombre, código..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Select value={filtroTipo} onValueChange={v => setFiltroTipo(v || "inventario")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inventario">Con inventario</SelectItem>
              <SelectItem value="servicios">Servicios</SelectItem>
              <SelectItem value="sin_enrolar">Sin enrolar (de Ventas)</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => abrir()}><PackagePlus className="size-4" /> Nuevo Producto</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead className="text-right">P. Compra</TableHead>
                  <TableHead className="text-right">P. Venta</TableHead>
                  <TableHead className="text-right">Costo Prom.</TableHead>
                  <TableHead className="text-right">Mín/Máx</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(p => (
                  <TableRow key={p.id} className={p.estado === "Descontinuado" ? "opacity-60" : ""}>
                    <TableCell className="font-mono text-xs">{p.sku || "-"}</TableCell>
                    <TableCell className="max-w-52 truncate font-medium">{p.nombre}</TableCell>
                    <TableCell>{p.categoria || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[p.talla && `T. ${p.talla}`, p.color, p.sexo, p.manga].filter(Boolean).join(" · ") || "-"}
                    </TableCell>
                    <TableCell className="text-right">{formatoPesos(p.precio_compra)}</TableCell>
                    <TableCell className="text-right">
                      {formatoPesos(p.precio_venta)}
                      {Number(p.iva_porcentaje) > 0 && <span className="block text-xs text-muted-foreground">IVA {p.iva_porcentaje}%</span>}
                    </TableCell>
                    <TableCell className="text-right">{formatoPesos(p.costo_promedio)}</TableCell>
                    <TableCell className="text-right text-xs">{p.stock_minimo} / {p.stock_maximo ?? "∞"}</TableCell>
                    <TableCell>
                      {p.es_servicio ? <Badge variant="secondary">Servicio</Badge>
                        : p.controla_inventario ? <Badge variant="default">Inventario</Badge>
                        : <Badge variant="outline">Sin enrolar</Badge>}
                    </TableCell>
                    <TableCell><Badge variant={p.estado === "Activo" ? "outline" : "destructive"}>{p.estado}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => abrir(p)}><Pencil className="size-4" /></Button>
                      <Button
                        variant="ghost" size="icon" disabled={pendiente}
                        title={p.estado === "Activo" ? "Descontinuar" : "Reactivar"}
                        onClick={() => alternarEstado(p)}
                      >
                        {p.estado === "Activo" ? <Archive className="size-4" /> : <ArchiveRestore className="size-4 text-primary" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG PRODUCTO */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar Producto" : "Nuevo Producto"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <p className="col-span-2 text-xs font-semibold uppercase text-muted-foreground">Identificación</p>
            <div className="col-span-2 grid gap-1.5"><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Camiseta Polo H — M — Blanca" /></div>
            <div className="grid gap-1.5"><Label>SKU (código interno)</Label><Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="Ej. CAM-POLO-H-M-BLA" /></div>
            <div className="grid gap-1.5"><Label>Código de barras</Label><Input value={form.codigo_barras} onChange={e => setForm({ ...form, codigo_barras: e.target.value })} placeholder="Opcional" /></div>

            <p className="col-span-2 mt-1 text-xs font-semibold uppercase text-muted-foreground">Clasificación</p>
            <div className="grid gap-1.5"><Label>Categoría</Label><Combo opciones={maestros["categoria_producto"] || []} value={form.categoria} onChange={v => setForm({ ...form, categoria: v })} /></div>
            <div className="grid gap-1.5"><Label>Subcategoría</Label><Input value={form.subcategoria} onChange={e => setForm({ ...form, subcategoria: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Sexo</Label><Combo opciones={maestros["sexo"] || ["Hombre", "Mujer", "Unisex"]} value={form.sexo} onChange={v => setForm({ ...form, sexo: v })} /></div>
            <div className="grid gap-1.5"><Label>Talla</Label><Combo opciones={maestros["talla"] || []} value={form.talla} onChange={v => setForm({ ...form, talla: v })} /></div>
            <div className="grid gap-1.5"><Label>Color</Label><Combo opciones={maestros["color"] || []} value={form.color} onChange={v => setForm({ ...form, color: v })} /></div>
            <div className="grid gap-1.5"><Label>Tipo de manga</Label><Combo opciones={maestros["tipo_manga"] || []} value={form.manga} onChange={v => setForm({ ...form, manga: v })} /></div>
            <div className="grid gap-1.5"><Label>Unidad de medida</Label><Combo opciones={maestros["unidad_medida"] || []} value={form.unidad_medida} onChange={v => setForm({ ...form, unidad_medida: v })} /></div>
            <div className="grid gap-1.5"><Label>Fecha de vencimiento</Label><Input type="date" value={form.fecha_vencimiento} onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} /></div>

            <p className="col-span-2 mt-1 text-xs font-semibold uppercase text-muted-foreground">Precios</p>
            <div className="grid gap-1.5"><Label>Precio de compra</Label><Input type="number" min={0} value={form.precio_compra || ""} onChange={e => setForm({ ...form, precio_compra: Number(e.target.value) })} placeholder="0" /></div>
            <div className="grid gap-1.5"><Label>Precio venta (antes de IVA)</Label><Input type="number" min={0} value={form.precio_venta_antes_iva || ""} onChange={e => setForm({ ...form, precio_venta_antes_iva: Number(e.target.value) })} placeholder="0" /></div>
            <div className="grid gap-1.5"><Label>% IVA</Label><Input type="number" min={0} max={100} value={form.iva_porcentaje || ""} onChange={e => setForm({ ...form, iva_porcentaje: Number(e.target.value) })} placeholder="0" /></div>
            <div className="grid gap-1.5">
              <Label>Precio final de venta</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-bold">{formatoPesos(precioFinal)}</div>
            </div>

            <p className="col-span-2 mt-1 text-xs font-semibold uppercase text-muted-foreground">Inventario</p>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.es_servicio}
                onCheckedChange={v => setForm({ ...form, es_servicio: v, controla_inventario: v ? false : form.controla_inventario })}
              />
              Es un servicio (no mueve inventario)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.controla_inventario}
                onCheckedChange={v => setForm({ ...form, controla_inventario: v })}
                disabled={form.es_servicio}
              />
              Controla inventario
            </label>
            {form.controla_inventario && (
              <>
                <div className="grid gap-1.5"><Label>Stock mínimo</Label><Input type="number" min={0} value={form.stock_minimo || ""} onChange={e => setForm({ ...form, stock_minimo: Number(e.target.value) })} placeholder="0" /></div>
                <div className="grid gap-1.5"><Label>Stock máximo (0 = sin máximo)</Label><Input type="number" min={0} value={form.stock_maximo || ""} onChange={e => setForm({ ...form, stock_maximo: Number(e.target.value) })} placeholder="0" /></div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente || !form.nombre.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
