"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarReceta, eliminarReceta, recalcularCostosDesdeInventario, type LineaReceta } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calculator, Plus, Trash2, Pencil, RefreshCw } from "lucide-react";
import { InsumosTab } from "./insumos-tab";
import {
  formatoPesos, costoVigente, costoVigenteInsumo,
  type Producto, type Receta, type RecetaMaterial, type TipoLineaReceta,
  type Insumo, type MovimientoInsumo, type Proveedor,
} from "@/lib/tipos";

type RecetasPorProducto = Record<number, { receta: Receta; lineas: RecetaMaterial[] }>;

const TIPOS: TipoLineaReceta[] = ["Material", "Mano de obra", "Servicio", "Otro"];
const LINEA_VACIA: LineaReceta = { tipo: "Material", material: "", cantidad: 1, costo_unitario: 0, unidad_medida: "" };

/**
 * Opción del selector de material: un insumo del inventario de insumos (el caso
 * normal) o un producto del catálogo (cuando el material se compra terminado —
 * una camiseta en blanco que luego se estampa).
 */
type OpcionMaterial = {
  clave: string;
  origen: "Insumo" | "Producto";
  insumo_id: number | null;
  producto_id: number | null;
  nombre: string;
  unidad: string;
  costo: number;
  detalle: string;
};

export function CostosCliente({ productos, recetas, insumos, movimientos, proveedores, unidades, categoriasInsumo }: {
  productos: Producto[];
  recetas: RecetasPorProducto;
  insumos: Insumo[];
  movimientos: MovimientoInsumo[];
  proveedores: Proveedor[];
  unidades: string[];
  categoriasInsumo: string[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");

  const [abierto, setAbierto] = useState(false);
  const [prodSel, setProdSel] = useState<Producto | null>(null);
  const [busqProd, setBusqProd] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaReceta[]>([{ ...LINEA_VACIA }]);
  // Búsqueda del combobox de material, por índice de línea
  const [busqMat, setBusqMat] = useState<Record<number, string>>({});

  const vendibles = useMemo(() => productos.filter(p => p.estado === "Activo"), [productos]);

  /** Insumos primero (son la fuente natural), luego los productos del catálogo. */
  const opcionesMaterial = useMemo<OpcionMaterial[]>(() => [
    ...insumos.filter(i => i.activo).map(i => ({
      clave: `i-${i.id}`,
      origen: "Insumo" as const,
      insumo_id: i.id,
      producto_id: null,
      nombre: i.nombre,
      unidad: i.unidad_medida || "",
      costo: costoVigenteInsumo(i),
      detalle: `Existencia: ${Number(i.existencia)} ${i.unidad_medida}`,
    })),
    ...vendibles.map(p => ({
      clave: `p-${p.id}`,
      origen: "Producto" as const,
      insumo_id: null,
      producto_id: p.id,
      nombre: p.nombre,
      unidad: p.unidad_medida || "",
      costo: costoVigente(p),
      detalle: p.sku || "Del catálogo de productos",
    })),
  ], [insumos, vendibles]);

  /** Una fila por producto que ya tiene receta, con su utilidad y margen. */
  const filas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return Object.entries(recetas)
      .map(([pid, r]) => {
        const p = productos.find(x => x.id === Number(pid));
        if (!p) return null;
        const costo = Number(r.receta.costo_total) || 0;
        const precio = Number(p.precio_venta_antes_iva) || 0;
        const utilidad = precio - costo;
        const margen = precio > 0 ? (utilidad / precio) * 100 : 0;
        return { producto: p, receta: r.receta, lineas: r.lineas, costo, precio, utilidad, margen };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .filter(f => !q || f.producto.nombre.toLowerCase().includes(q) || (f.producto.sku || "").toLowerCase().includes(q))
      .sort((a, b) => a.margen - b.margen);
  }, [recetas, productos, busqueda]);

  const kpis = useMemo(() => {
    const conReceta = Object.keys(recetas).length;
    const conPrecio = filas.filter(f => f.precio > 0);
    const margenProm = conPrecio.length ? conPrecio.reduce((s, f) => s + f.margen, 0) / conPrecio.length : null;
    return {
      conReceta,
      sinReceta: vendibles.filter(p => !recetas[p.id] && !p.es_servicio).length,
      margenProm,
      enPerdida: filas.filter(f => f.precio > 0 && f.utilidad < 0).length,
    };
  }, [recetas, vendibles, filas]);

  const costoTotalForm = useMemo(
    () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0), 0),
    [lineas],
  );
  const precioForm = Number(prodSel?.precio_venta_antes_iva) || 0;
  const utilidadForm = precioForm - costoTotalForm;
  const margenForm = precioForm > 0 ? (utilidadForm / precioForm) * 100 : 0;

  const abrirNueva = () => {
    setProdSel(null); setBusqProd(""); setNotas("");
    setLineas([{ ...LINEA_VACIA }]); setBusqMat({});
    setAbierto(true);
  };

  const abrirEdicion = (f: (typeof filas)[number]) => {
    setProdSel(f.producto);
    setBusqProd(f.producto.nombre);
    setNotas(f.receta.notas || "");
    setLineas(f.lineas.map(l => ({
      tipo: l.tipo,
      insumo_id: l.insumo_id,
      material_producto_id: l.material_producto_id,
      material: l.material,
      cantidad: Number(l.cantidad) || 1,
      unidad_medida: l.unidad_medida || "",
      costo_unitario: Number(l.costo_unitario) || 0,
      notas: l.notas || "",
    })));
    setBusqMat(Object.fromEntries(f.lineas.map((l, i) => [i, l.material])));
    setAbierto(true);
  };

  const setLinea = (i: number, cambios: Partial<LineaReceta>) => {
    setLineas(prev => prev.map((l, j) => (j === i ? { ...l, ...cambios } : l)));
  };

  /** Al elegir un material de la lista se propone su costo vigente y su unidad. */
  const elegirMaterial = (i: number, o: OpcionMaterial | null) => {
    if (!o) { setLinea(i, { insumo_id: null, material_producto_id: null }); return; }
    setLinea(i, {
      insumo_id: o.insumo_id,
      material_producto_id: o.producto_id,
      material: o.nombre,
      unidad_medida: o.unidad,
      costo_unitario: o.costo,
    });
    setBusqMat(prev => ({ ...prev, [i]: o.nombre }));
  };

  /** Opción seleccionada de una línea, para que el Combobox muestre su valor. */
  const opcionDeLinea = (l: LineaReceta): OpcionMaterial | null =>
    opcionesMaterial.find(o =>
      (l.insumo_id != null && o.insumo_id === l.insumo_id)
      || (l.insumo_id == null && l.material_producto_id != null && o.producto_id === l.material_producto_id),
    ) ?? null;

  const guardar = () => {
    if (!prodSel) { toast.error("Elige el producto de la receta."); return; }
    startTransition(async () => {
      try {
        const r = await guardarReceta({ producto_id: prodSel.id, notas, lineas });
        toast.success(`Receta guardada — costo ${formatoPesos(r.costo_total)}`);
        setAbierto(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const borrar = (f: (typeof filas)[number]) => {
    if (!confirm(`¿Eliminar la receta de "${f.producto.nombre}"? Las ventas ya registradas conservan su costo.`)) return;
    startTransition(async () => {
      try {
        await eliminarReceta(f.receta.id);
        toast.success("Receta eliminada");
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const recalcular = () => {
    startTransition(async () => {
      try {
        const r = await recalcularCostosDesdeInventario();
        toast.success(r.lineas === 0
          ? "Los costos ya estaban al día."
          : `Actualizadas ${r.lineas} línea(s) en ${r.recetas} receta(s).`);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Calculator className="size-5" /> Costos y Recetas</h2>
          <p className="text-sm text-muted-foreground">
            Define de qué está hecho cada producto para saber cuánto cuesta y cuánto deja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={recalcular} disabled={pendiente}>
            <RefreshCw className="size-4" /> Recalcular costos desde inventario
          </Button>
          {insumos.length === 0 && (
            <p className="w-full text-xs text-muted-foreground sm:w-auto">
              Empieza por la pestaña <strong>Insumos</strong>: ahí registras telas, hilos y mano de obra con su costo.
            </p>
          )}
          <Button onClick={abrirNueva}><Plus className="size-4" /> Nueva receta</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Con receta</p>
          <p className="text-2xl font-bold">{kpis.conReceta}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Sin receta</p>
          <p className="text-2xl font-bold">{kpis.sinReceta}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Margen promedio</p>
          <p className="text-2xl font-bold">{kpis.margenProm != null ? `${kpis.margenProm.toFixed(1)}%` : "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-2">
          <p className="text-xs font-medium uppercase text-muted-foreground">Vendiendo con pérdida</p>
          <p className={`text-2xl font-bold ${kpis.enPerdida > 0 ? "text-destructive" : ""}`}>{kpis.enPerdida}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="recetas">
        <TabsList>
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
        </TabsList>

        <TabsContent value="recetas">
          <Card>
            <CardContent className="grid gap-3 pt-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Input className="w-64" placeholder="Buscar por producto o SKU..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <p className="text-sm text-muted-foreground">{filas.length} receta(s)</p>
              </div>

              <div className="tabla-scroll max-h-[560px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Precio (antes IVA)</TableHead>
                      <TableHead className="text-right">Utilidad</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Aún no hay recetas. Crea la primera con &quot;Nueva receta&quot;.
                      </TableCell></TableRow>
                    )}
                    {filas.map(f => (
                      <TableRow key={f.receta.id}>
                        <TableCell className="max-w-64">
                          <span className="block truncate font-medium">{f.producto.nombre}</span>
                          {f.producto.sku && <span className="block truncate text-xs text-muted-foreground">{f.producto.sku}</span>}
                        </TableCell>
                        <TableCell className="text-right">{f.lineas.length}</TableCell>
                        <TableCell className="text-right">{formatoPesos(f.costo)}</TableCell>
                        <TableCell className="text-right">{f.precio > 0 ? formatoPesos(f.precio) : "—"}</TableCell>
                        <TableCell className={`text-right font-bold ${f.precio === 0 ? "" : f.utilidad < 0 ? "text-destructive" : "text-primary"}`}>
                          {f.precio > 0 ? formatoPesos(f.utilidad) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${f.precio === 0 ? "" : f.utilidad < 0 ? "text-destructive" : ""}`}>
                          {f.precio > 0 ? `${f.margen.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button variant="ghost" size="icon" title="Editar receta" onClick={() => abrirEdicion(f)}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar receta" onClick={() => borrar(f)}><Trash2 className="size-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Ordenado por margen: las referencias que menos dejan aparecen primero. Un producto sin precio de venta no muestra utilidad.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insumos">
          <InsumosTab
            insumos={insumos}
            movimientos={movimientos}
            proveedores={proveedores}
            categorias={categoriasInsumo}
            unidades={unidades}
          />
        </TabsContent>

        <TabsContent value="rentabilidad">
          <Card>
            <CardContent className="grid gap-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Desglose del costo de cada receta. Sirve para ver qué material pesa más en el precio final.
              </p>
              <div className="tabla-scroll max-h-[560px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Material / concepto</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Costo unit.</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">% del costo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin recetas.</TableCell></TableRow>
                    )}
                    {filas.flatMap(f => f.lineas.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="max-w-52 truncate">{f.producto.nombre}</TableCell>
                        <TableCell className="text-xs">{l.tipo}</TableCell>
                        <TableCell className="max-w-52 truncate">{l.material}</TableCell>
                        <TableCell className="text-right">{l.cantidad}</TableCell>
                        <TableCell className="text-xs">{l.unidad_medida || "—"}</TableCell>
                        <TableCell className="text-right">{formatoPesos(l.costo_unitario)}</TableCell>
                        <TableCell className="text-right font-medium">{formatoPesos(l.costo_total)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {f.costo > 0 ? `${((Number(l.costo_total) / f.costo) * 100).toFixed(0)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG RECETA */}
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>{recetas[prodSel?.id ?? -1] ? "Editar receta" : "Nueva receta"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Producto *</Label>
              <Combobox
                items={vendibles}
                itemToStringLabel={(p: Producto | null) => p?.nombre ?? ""}
                value={prodSel}
                onValueChange={v => setProdSel((v as Producto) ?? null)}
                inputValue={busqProd}
                onInputValueChange={v => setBusqProd(v ?? "")}
                openOnInputClick
              >
                <ComboboxInput placeholder="Buscar el producto que se fabrica..." className="w-full" showClear />
                <ComboboxContent>
                  <ComboboxEmpty>No se encontró el producto.</ComboboxEmpty>
                  <ComboboxList>
                    {(p: Producto) => (
                      <ComboboxItem key={p.id} value={p}>
                        <div className="flex flex-col">
                          <span className="font-medium">{p.sku ? `${p.sku} — ` : ""}{p.nombre}</span>
                          <span className="text-xs text-muted-foreground">Precio antes de IVA: {formatoPesos(p.precio_venta_antes_iva)}</span>
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Materiales y conceptos de costo</p>
              <Button variant="outline" size="sm" onClick={() => setLineas(p => [...p, { ...LINEA_VACIA }])}>
                <Plus className="size-4" /> Añadir línea
              </Button>
            </div>

            {lineas.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[7rem_1fr_5rem_7rem_8rem_7rem_auto]">
                <Select value={l.tipo || "Material"} onValueChange={v => v && setLinea(i, { tipo: v as TipoLineaReceta })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>

                <Combobox
                  items={opcionesMaterial}
                  itemToStringLabel={(o: OpcionMaterial | null) => o?.nombre ?? ""}
                  value={opcionDeLinea(l)}
                  onValueChange={v => elegirMaterial(i, (v as OpcionMaterial) ?? null)}
                  inputValue={busqMat[i] ?? l.material}
                  onInputValueChange={v => { setBusqMat(prev => ({ ...prev, [i]: v ?? "" })); setLinea(i, { material: v ?? "", insumo_id: null, material_producto_id: null }); }}
                  openOnInputClick
                >
                  <ComboboxInput placeholder="Insumo, producto del catálogo, o escribe uno libre..." className="w-full" showClear />
                  <ComboboxContent>
                    <ComboboxEmpty>Sin coincidencias — se usará el texto escrito.</ComboboxEmpty>
                    <ComboboxList>
                      {(o: OpcionMaterial) => (
                        <ComboboxItem key={o.clave} value={o}>
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1.5 font-medium">
                              {o.nombre}
                              <Badge variant={o.origen === "Insumo" ? "default" : "outline"} className="text-[10px]">{o.origen}</Badge>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Costo actual: {formatoPesos(o.costo)}{o.unidad ? ` · ${o.unidad}` : ""} · {o.detalle}
                            </span>
                          </div>
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>

                <Input type="number" step="any" min={0} value={l.cantidad || ""} onChange={e => setLinea(i, { cantidad: Number(e.target.value) })} placeholder="Cant." />
                <Combo opciones={unidades} value={l.unidad_medida || ""} onChange={v => setLinea(i, { unidad_medida: v })} placeholder="Unidad" />
                <Input type="number" step="any" min={0} value={l.costo_unitario || ""} onChange={e => setLinea(i, { costo_unitario: Number(e.target.value) })} placeholder="Costo unit." />
                <div className="flex h-9 items-center justify-end rounded-md border bg-muted/40 px-2 text-sm font-medium">
                  {formatoPesos((Number(l.cantidad) || 0) * (Number(l.costo_unitario) || 0))}
                </div>
                <Button
                  variant="ghost" size="icon" className="text-destructive"
                  onClick={() => setLineas(p => (p.length === 1 ? [{ ...LINEA_VACIA }] : p.filter((_, j) => j !== i)))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            <div className="grid gap-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones de la ficha de costo (opcional)" />
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
              <div><p className="text-muted-foreground">Costo total</p><p className="font-bold">{formatoPesos(costoTotalForm)}</p></div>
              <div><p className="text-muted-foreground">Precio (antes IVA)</p><p className="font-bold">{precioForm > 0 ? formatoPesos(precioForm) : "—"}</p></div>
              <div>
                <p className="text-muted-foreground">Utilidad</p>
                <p className={`font-bold ${precioForm === 0 ? "" : utilidadForm < 0 ? "text-destructive" : "text-primary"}`}>
                  {precioForm > 0 ? formatoPesos(utilidadForm) : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Margen</p>
                <p className={`font-bold ${precioForm === 0 ? "" : utilidadForm < 0 ? "text-destructive" : ""}`}>
                  {precioForm > 0 ? `${margenForm.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>
            {precioForm > 0 && utilidadForm < 0 && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
                Con esta receta el producto se vendería por debajo de su costo.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={pendiente || !prodSel}>Guardar receta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
