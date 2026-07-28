"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ingresarMercancia, trasladarStock, ajustarStock, salidaManual, importarInventarioInicial, crearProveedor, type FilaImportacion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Combo } from "@/components/combo";
import { PackagePlus, ArrowLeftRight, ClipboardCheck, PackageMinus, FileUp, FileDown, Truck } from "lucide-react";
import type { Producto, InventarioUbicacion, InventarioExistencia, Proveedor } from "@/lib/tipos";

type Props = {
  productos: Producto[];
  ubicaciones: InventarioUbicacion[];
  existencias: InventarioExistencia[];
  proveedores: Proveedor[];
  maestros: Record<string, string[]>;
};

const HOY = () => new Date().toISOString().slice(0, 10);

const COLUMNAS_PLANTILLA = [
  "SKU", "Codigo Barras", "Nombre*", "Categoria", "Subcategoria", "Sexo", "Talla", "Color", "Manga",
  "Unidad Medida", "Es Servicio (SI/NO)", "Precio Compra", "Precio Venta Antes IVA", "% IVA",
  "Stock Minimo", "Stock Maximo", "Fecha Vencimiento (AAAA-MM-DD)",
  "Cantidad Bodega", "Cantidad Exhibicion", "Costo Unitario", "Proveedor", "Numero Factura", "Observaciones",
];

function SelectorProducto({ productos, stockDe, valor, onCambio, busqueda, setBusqueda }: {
  productos: Producto[];
  stockDe: (productoId: number, ubicacionId?: number) => number;
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
      <ComboboxInput placeholder="Buscar por SKU o nombre..." className="w-full" showClear />
      <ComboboxContent>
        <ComboboxEmpty>No se encontró el producto.</ComboboxEmpty>
        <ComboboxList>
          {(p: Producto) => (
            <ComboboxItem key={p.id} value={p}>
              <div className="flex flex-col">
                <span className="font-medium">{p.sku ? `${p.sku} — ` : ""}{p.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {[p.categoria, p.talla && `T. ${p.talla}`, p.color].filter(Boolean).join(" · ")} · Stock: {stockDe(p.id)}
                </span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

function SelectorUbicacion({ ubicaciones, valor, onCambio, excluir }: {
  ubicaciones: InventarioUbicacion[];
  valor: number; onCambio: (id: number) => void; excluir?: number;
}) {
  return (
    <Select value={valor ? String(valor) : ""} onValueChange={v => v && onCambio(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione ubicación..." /></SelectTrigger>
      <SelectContent>
        {ubicaciones.filter(u => u.activa && u.id !== excluir).map(u => (
          <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function OperacionesTab({ productos, ubicaciones, existencias, proveedores, maestros }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  // Todos los productos activos que no sean servicios: se pueden operar
  // aunque aún no controlen inventario (el primer movimiento los enrola).
  const inventariables = useMemo(
    () => productos.filter(p => !p.es_servicio && p.estado === "Activo"),
    [productos]
  );

  const stockDe = (productoId: number, ubicacionId?: number) => {
    const filas = existencias.filter(e => e.producto_id === productoId && (ubicacionId == null || e.ubicacion_id === ubicacionId));
    return filas.reduce((s, e) => s + Number(e.cantidad), 0);
  };

  // ---------- Ingreso ----------
  const [dialogIngreso, setDialogIngreso] = useState(false);
  const [prodIngreso, setProdIngreso] = useState<Producto | null>(null);
  const [busqIngreso, setBusqIngreso] = useState("");
  const [formIngreso, setFormIngreso] = useState({ ubicacion_id: 0, cantidad: 0, costo_unitario: 0, fecha: HOY(), numero_factura: "", lote: "", observaciones: "" });

  // Proveedor (con creación al vuelo)
  const [listaProv, setListaProv] = useState<Proveedor[]>(proveedores);
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null);
  const [busqProveedor, setBusqProveedor] = useState("");
  const [dialogProveedor, setDialogProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState({ nombre: "", nit: "", contacto: "", correo: "", ciudad: "" });

  const guardarIngreso = () => {
    if (!prodIngreso) return;
    startTransition(async () => {
      try {
        await ingresarMercancia({
          producto_id: prodIngreso.id, ...formIngreso,
          proveedor_id: proveedorSel?.id || undefined,
        });
        toast.success("Mercancía ingresada");
        setDialogIngreso(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const guardarNuevoProveedor = () => {
    if (!nuevoProveedor.nombre.trim()) return;
    startTransition(async () => {
      try {
        const p = await crearProveedor(nuevoProveedor) as Proveedor;
        setListaProv(prev => [...prev, p]);
        setProveedorSel(p);
        setBusqProveedor(p.nombre);
        setDialogProveedor(false);
        toast.success("Proveedor creado");
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // ---------- Traslado ----------
  const [dialogTraslado, setDialogTraslado] = useState(false);
  const [prodTraslado, setProdTraslado] = useState<Producto | null>(null);
  const [busqTraslado, setBusqTraslado] = useState("");
  const [formTraslado, setFormTraslado] = useState({ origen_id: 0, destino_id: 0, cantidad: 0, motivo: "" });

  const guardarTraslado = () => {
    if (!prodTraslado) return;
    startTransition(async () => {
      try {
        await trasladarStock({ producto_id: prodTraslado.id, ...formTraslado });
        toast.success("Traslado realizado");
        setDialogTraslado(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // ---------- Ajuste ----------
  const [dialogAjuste, setDialogAjuste] = useState(false);
  const [prodAjuste, setProdAjuste] = useState<Producto | null>(null);
  const [busqAjuste, setBusqAjuste] = useState("");
  const [formAjuste, setFormAjuste] = useState({ ubicacion_id: 0, cantidad_fisica: 0, motivo: "", observacion: "" });

  const sistemaAjuste = prodAjuste && formAjuste.ubicacion_id ? stockDe(prodAjuste.id, formAjuste.ubicacion_id) : null;
  const diferenciaAjuste = sistemaAjuste != null ? formAjuste.cantidad_fisica - sistemaAjuste : null;

  const guardarAjuste = () => {
    if (!prodAjuste) return;
    startTransition(async () => {
      try {
        const r = await ajustarStock({ producto_id: prodAjuste.id, ...formAjuste });
        toast.success(`Ajuste aplicado (diferencia: ${r.diferencia > 0 ? "+" : ""}${r.diferencia})`);
        setDialogAjuste(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // ---------- Salida manual ----------
  const [dialogSalida, setDialogSalida] = useState(false);
  const [prodSalida, setProdSalida] = useState<Producto | null>(null);
  const [busqSalida, setBusqSalida] = useState("");
  const [formSalida, setFormSalida] = useState({ ubicacion_id: 0, cantidad: 0, motivo: "" });

  const guardarSalida = () => {
    if (!prodSalida) return;
    startTransition(async () => {
      try {
        await salidaManual({ producto_id: prodSalida.id, ...formSalida });
        toast.success("Salida registrada");
        setDialogSalida(false);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  // ---------- Importación Excel ----------
  const [dialogImportar, setDialogImportar] = useState(false);
  const [filasImportar, setFilasImportar] = useState<FilaImportacion[]>([]);
  const [erroresParseo, setErroresParseo] = useState<{ fila: number; mensaje: string }[]>([]);
  const [resultadoImport, setResultadoImport] = useState<{ creados: number; actualizados: number; ingresados: number; errores: { fila: number; mensaje: string }[] } | null>(null);

  const descargarPlantilla = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ejemplo = [
      COLUMNAS_PLANTILLA,
      ["CAM-BLA-H-M", "", "Camiseta Blanca Hombre M", "Camisetas", "", "Hombre", "M", "Blanco", "Manga corta",
        "Unidad", "NO", 15000, 30000, 19, 4, 10, "", 8, 2, 15000, "", "", ""],
      ["", "", "Bordado logo empresarial", "Servicios", "", "", "", "", "", "Unidad", "SI", 0, 12000, 19, 0, 0, "", 0, 0, 0, "", "", ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ejemplo), "Inventario");
    const instrucciones = [
      ["INSTRUCCIONES"],
      ["- Nombre es obligatorio y debe ser único por referencia (ej: 'Camiseta Blanca Hombre M')."],
      ["- El SKU es opcional pero recomendado: si se repite en otra carga, actualiza el mismo producto."],
      ["- Es Servicio: SI/NO. Un servicio se vende pero no maneja cantidades de inventario."],
      ["- Cantidad Bodega / Cantidad Exhibicion: existencias iniciales. Solo se cargan UNA vez por producto."],
      ["- Costo Unitario: costo de la carga inicial (si va vacío se usa el Precio Compra)."],
      ["- Proveedor: NIT o nombre exacto de un proveedor ya registrado (opcional)."],
      [""],
      ["Categorías válidas:", (maestros["categoria_producto"] || []).join(", ")],
      ["Tallas válidas:", (maestros["talla"] || []).join(", ")],
      ["Unidades de medida:", (maestros["unidad_medida"] || []).join(", ")],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrucciones), "Instrucciones");
    XLSX.writeFile(wb, "Plantilla_Inventario_Nativo.xlsx");
  };

  const parsearArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    setResultadoImport(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await archivo.arrayBuffer());
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
      if (!crudas.length) { toast.error("El archivo no tiene filas de datos."); return; }

      const filas: FilaImportacion[] = [];
      const errores: { fila: number; mensaje: string }[] = [];
      const skusVistos = new Set<string>();
      const nombresVistos = new Set<string>();

      crudas.forEach((c, idx) => {
        const numFila = idx + 2; // fila real en Excel (1 = encabezados)
        const texto = (k: string) => String(c[k] ?? "").trim();
        const numero = (k: string) => {
          const v = c[k];
          if (v === "" || v == null) return 0;
          const n = Number(v);
          return isNaN(n) ? NaN : n;
        };
        const nombre = texto("Nombre*") || texto("Nombre");
        if (!nombre) { errores.push({ fila: numFila, mensaje: "Nombre vacío." }); return; }
        if (nombresVistos.has(nombre.toLowerCase())) { errores.push({ fila: numFila, mensaje: `Nombre duplicado en el archivo: "${nombre}".` }); return; }
        nombresVistos.add(nombre.toLowerCase());

        const sku = texto("SKU");
        if (sku) {
          if (skusVistos.has(sku.toLowerCase())) { errores.push({ fila: numFila, mensaje: `SKU duplicado en el archivo: "${sku}".` }); return; }
          skusVistos.add(sku.toLowerCase());
        }

        const esServicio = ["si", "sí", "s", "true", "1"].includes(texto("Es Servicio (SI/NO)").toLowerCase());
        const numeros: Record<string, number> = {};
        for (const k of ["Precio Compra", "Precio Venta Antes IVA", "% IVA", "Stock Minimo", "Stock Maximo", "Cantidad Bodega", "Cantidad Exhibicion", "Costo Unitario"]) {
          const n = numero(k);
          if (isNaN(n)) { errores.push({ fila: numFila, mensaje: `"${k}" no es un número válido.` }); return; }
          if (n < 0) { errores.push({ fila: numFila, mensaje: `"${k}" no puede ser negativo.` }); return; }
          numeros[k] = n;
        }
        if (esServicio && (numeros["Cantidad Bodega"] > 0 || numeros["Cantidad Exhibicion"] > 0)) {
          errores.push({ fila: numFila, mensaje: "Un servicio no puede tener cantidades de inventario." });
          return;
        }
        const fechaVenc = texto("Fecha Vencimiento (AAAA-MM-DD)");
        if (fechaVenc && isNaN(new Date(fechaVenc + "T00:00:00").getTime())) {
          errores.push({ fila: numFila, mensaje: "Fecha de vencimiento inválida (usa AAAA-MM-DD)." });
          return;
        }

        filas.push({
          fila: numFila,
          sku: sku || undefined,
          codigo_barras: texto("Codigo Barras") || undefined,
          nombre,
          categoria: texto("Categoria") || undefined,
          subcategoria: texto("Subcategoria") || undefined,
          sexo: texto("Sexo") || undefined,
          talla: texto("Talla") || undefined,
          color: texto("Color") || undefined,
          manga: texto("Manga") || undefined,
          unidad_medida: texto("Unidad Medida") || undefined,
          es_servicio: esServicio,
          precio_compra: numeros["Precio Compra"],
          precio_venta_antes_iva: numeros["Precio Venta Antes IVA"],
          iva_porcentaje: numeros["% IVA"],
          stock_minimo: numeros["Stock Minimo"],
          stock_maximo: numeros["Stock Maximo"],
          fecha_vencimiento: fechaVenc || undefined,
          cantidad_bodega: numeros["Cantidad Bodega"],
          cantidad_exhibicion: numeros["Cantidad Exhibicion"],
          costo_unitario: numeros["Costo Unitario"],
          proveedor: texto("Proveedor") || undefined,
          numero_factura: texto("Numero Factura") || undefined,
          observaciones: texto("Observaciones") || undefined,
        });
      });

      setFilasImportar(filas);
      setErroresParseo(errores);
      if (!filas.length) toast.error("Ninguna fila pasó la validación.");
    } catch (e) {
      toast.error("No se pudo leer el archivo: " + (e as Error).message);
    }
  };

  const ejecutarImportacion = () => {
    if (!filasImportar.length) return;
    startTransition(async () => {
      try {
        const r = await importarInventarioInicial(filasImportar);
        setResultadoImport(r);
        setFilasImportar([]);
        setErroresParseo([]);
        toast.success(`Importación completada: ${r.creados} creados, ${r.actualizados} actualizados`);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const cardsOperacion = [
    { titulo: "Ingreso de Mercancía", descripcion: "Compras y entradas: aumenta el stock y recalcula el costo promedio.", icono: PackagePlus, onClick: () => { setProdIngreso(null); setBusqIngreso(""); setProveedorSel(null); setBusqProveedor(""); setFormIngreso({ ubicacion_id: 0, cantidad: 0, costo_unitario: 0, fecha: HOY(), numero_factura: "", lote: "", observaciones: "" }); setDialogIngreso(true); } },
    { titulo: "Traslado", descripcion: "Mueve stock entre tus bodegas / ubicaciones, con historial.", icono: ArrowLeftRight, onClick: () => { setProdTraslado(null); setBusqTraslado(""); setFormTraslado({ origen_id: 0, destino_id: 0, cantidad: 0, motivo: "" }); setDialogTraslado(true); } },
    { titulo: "Ajuste", descripcion: "Conteo físico puntual: sistema vs físico, con motivo.", icono: ClipboardCheck, onClick: () => { setProdAjuste(null); setBusqAjuste(""); setFormAjuste({ ubicacion_id: 0, cantidad_fisica: 0, motivo: "", observacion: "" }); setDialogAjuste(true); } },
    { titulo: "Salida Manual", descripcion: "Bajas, muestras u obsequios que salen del inventario.", icono: PackageMinus, onClick: () => { setProdSalida(null); setBusqSalida(""); setFormSalida({ ubicacion_id: 0, cantidad: 0, motivo: "" }); setDialogSalida(true); } },
    { titulo: "Importar Excel", descripcion: "Carga masiva del inventario inicial con la plantilla.", icono: FileUp, onClick: () => { setFilasImportar([]); setErroresParseo([]); setResultadoImport(null); setDialogImportar(true); } },
  ];

  return (
    <div className="grid gap-4 pt-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cardsOperacion.map(c => (
          <button key={c.titulo} type="button" onClick={c.onClick} className="text-left">
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="pt-2">
                <c.icono className="mb-2 size-5 text-primary" />
                <p className="font-semibold">{c.titulo}</p>
                <p className="text-xs text-muted-foreground">{c.descripcion}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* DIALOG INGRESO */}
      <Dialog open={dialogIngreso} onOpenChange={setDialogIngreso}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Ingreso de Mercancía</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Producto *</Label>
              <SelectorProducto productos={inventariables} stockDe={stockDe} valor={prodIngreso} onCambio={setProdIngreso} busqueda={busqIngreso} setBusqueda={setBusqIngreso} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Ubicación de ingreso *</Label><SelectorUbicacion ubicaciones={ubicaciones} valor={formIngreso.ubicacion_id} onCambio={id => setFormIngreso({ ...formIngreso, ubicacion_id: id })} /></div>
              <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={formIngreso.fecha} onChange={e => setFormIngreso({ ...formIngreso, fecha: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Cantidad *</Label><Input type="number" min={0} value={formIngreso.cantidad || ""} onChange={e => setFormIngreso({ ...formIngreso, cantidad: Number(e.target.value) })} placeholder="0" /></div>
              <div className="grid gap-1.5"><Label>Costo unitario *</Label><Input type="number" min={0} value={formIngreso.costo_unitario || ""} onChange={e => setFormIngreso({ ...formIngreso, costo_unitario: Number(e.target.value) })} placeholder="0" /></div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Proveedor</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setNuevoProveedor({ nombre: busqProveedor.trim(), nit: "", contacto: "", correo: "", ciudad: "" }); setDialogProveedor(true); }}>
                    <Truck className="size-3.5" /> Nuevo
                  </Button>
                </div>
                <Combobox
                  items={listaProv}
                  itemToStringLabel={(p: Proveedor | null) => p?.nombre ?? ""}
                  value={proveedorSel}
                  onValueChange={v => setProveedorSel((v as Proveedor) ?? null)}
                  inputValue={busqProveedor}
                  onInputValueChange={v => setBusqProveedor(v ?? "")}
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
              <div className="grid gap-1.5"><Label>Número de factura</Label><Input value={formIngreso.numero_factura} onChange={e => setFormIngreso({ ...formIngreso, numero_factura: e.target.value })} placeholder="Opcional" /></div>
              <div className="grid gap-1.5"><Label>Lote</Label><Input value={formIngreso.lote} onChange={e => setFormIngreso({ ...formIngreso, lote: e.target.value })} placeholder="Opcional" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Observaciones</Label><Textarea rows={2} value={formIngreso.observaciones} onChange={e => setFormIngreso({ ...formIngreso, observaciones: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogIngreso(false)}>Cancelar</Button>
            <Button onClick={guardarIngreso} disabled={pendiente || !prodIngreso || !formIngreso.ubicacion_id || formIngreso.cantidad <= 0}>Ingresar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG TRASLADO */}
      <Dialog open={dialogTraslado} onOpenChange={setDialogTraslado}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Traslado entre Ubicaciones</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Producto *</Label>
              <SelectorProducto productos={inventariables} stockDe={stockDe} valor={prodTraslado} onCambio={setProdTraslado} busqueda={busqTraslado} setBusqueda={setBusqTraslado} />
            </div>
            {prodTraslado && (
              <p className="text-xs text-muted-foreground">
                Stock actual: {ubicaciones.map(u => `${u.nombre}: ${stockDe(prodTraslado.id, u.id)}`).join(" · ")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Origen *</Label><SelectorUbicacion ubicaciones={ubicaciones} valor={formTraslado.origen_id} onCambio={id => setFormTraslado({ ...formTraslado, origen_id: id })} excluir={formTraslado.destino_id} /></div>
              <div className="grid gap-1.5"><Label>Destino *</Label><SelectorUbicacion ubicaciones={ubicaciones} valor={formTraslado.destino_id} onCambio={id => setFormTraslado({ ...formTraslado, destino_id: id })} excluir={formTraslado.origen_id} /></div>
              <div className="grid gap-1.5"><Label>Cantidad *</Label><Input type="number" min={0} value={formTraslado.cantidad || ""} onChange={e => setFormTraslado({ ...formTraslado, cantidad: Number(e.target.value) })} placeholder="0" /></div>
              <div className="grid gap-1.5"><Label>Motivo</Label><Combo opciones={maestros["motivo_traslado"] || []} value={formTraslado.motivo} onChange={v => setFormTraslado({ ...formTraslado, motivo: v })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTraslado(false)}>Cancelar</Button>
            <Button onClick={guardarTraslado} disabled={pendiente || !prodTraslado || !formTraslado.origen_id || !formTraslado.destino_id || formTraslado.cantidad <= 0}>Trasladar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG AJUSTE */}
      <Dialog open={dialogAjuste} onOpenChange={setDialogAjuste}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Ajuste de Inventario</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Producto *</Label>
              <SelectorProducto productos={inventariables} stockDe={stockDe} valor={prodAjuste} onCambio={setProdAjuste} busqueda={busqAjuste} setBusqueda={setBusqAjuste} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Ubicación *</Label><SelectorUbicacion ubicaciones={ubicaciones} valor={formAjuste.ubicacion_id} onCambio={id => setFormAjuste({ ...formAjuste, ubicacion_id: id })} /></div>
              <div className="grid gap-1.5"><Label>Cantidad física contada *</Label><Input type="number" min={0} value={formAjuste.cantidad_fisica || ""} onChange={e => setFormAjuste({ ...formAjuste, cantidad_fisica: Number(e.target.value) })} placeholder="0" /></div>
            </div>
            {sistemaAjuste != null && (
              <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm">
                <span>Sistema: <span className="font-bold">{sistemaAjuste}</span></span>
                <span>→ Física: <span className="font-bold">{formAjuste.cantidad_fisica}</span></span>
                <span>Diferencia:{" "}
                  <span className={`font-bold ${(diferenciaAjuste || 0) === 0 ? "" : (diferenciaAjuste || 0) > 0 ? "text-primary" : "text-destructive"}`}>
                    {(diferenciaAjuste || 0) > 0 ? "+" : ""}{diferenciaAjuste}
                  </span>
                </span>
              </div>
            )}
            <div className="grid gap-1.5"><Label>Motivo *</Label><Combo opciones={maestros["motivo_ajuste"] || []} value={formAjuste.motivo} onChange={v => setFormAjuste({ ...formAjuste, motivo: v })} /></div>
            <div className="grid gap-1.5"><Label>Observación</Label><Textarea rows={2} value={formAjuste.observacion} onChange={e => setFormAjuste({ ...formAjuste, observacion: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAjuste(false)}>Cancelar</Button>
            <Button onClick={guardarAjuste} disabled={pendiente || !prodAjuste || !formAjuste.ubicacion_id || !formAjuste.motivo.trim() || diferenciaAjuste === 0}>Guardar Ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG SALIDA MANUAL */}
      <Dialog open={dialogSalida} onOpenChange={setDialogSalida}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Salida Manual</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Producto *</Label>
              <SelectorProducto productos={inventariables} stockDe={stockDe} valor={prodSalida} onCambio={setProdSalida} busqueda={busqSalida} setBusqueda={setBusqSalida} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>Ubicación *</Label><SelectorUbicacion ubicaciones={ubicaciones} valor={formSalida.ubicacion_id} onCambio={id => setFormSalida({ ...formSalida, ubicacion_id: id })} /></div>
              <div className="grid gap-1.5"><Label>Cantidad *</Label><Input type="number" min={0} value={formSalida.cantidad || ""} onChange={e => setFormSalida({ ...formSalida, cantidad: Number(e.target.value) })} placeholder="0" /></div>
            </div>
            <div className="grid gap-1.5"><Label>Motivo *</Label><Input value={formSalida.motivo} onChange={e => setFormSalida({ ...formSalida, motivo: e.target.value })} placeholder="Ej. Muestra para cliente, prenda dañada..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogSalida(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={guardarSalida} disabled={pendiente || !prodSalida || !formSalida.ubicacion_id || formSalida.cantidad <= 0 || !formSalida.motivo.trim()}>Registrar Salida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG IMPORTAR EXCEL */}
      <Dialog open={dialogImportar} onOpenChange={setDialogImportar}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>Importar Inventario desde Excel</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={descargarPlantilla}><FileDown className="size-4" /> Descargar Plantilla</Button>
              <Input type="file" accept=".xlsx,.xls" className="w-72" onChange={e => parsearArchivo(e.target.files?.[0])} />
            </div>
            <p className="text-xs text-muted-foreground">
              Usa la plantilla: la primera hoja con los productos, una fila por referencia. Las cantidades iniciales solo se cargan una vez por producto.
            </p>

            {erroresParseo.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="mb-1 text-sm font-semibold text-destructive">{erroresParseo.length} fila(s) con errores (no se importarán):</p>
                <div className="max-h-32 overflow-auto text-xs">
                  {erroresParseo.map((e, i) => <p key={i}>Fila {e.fila}: {e.mensaje}</p>)}
                </div>
              </div>
            )}

            {filasImportar.length > 0 && (
              <>
                <p className="text-sm"><Badge variant="default">{filasImportar.length}</Badge> fila(s) válidas listas para importar.</p>
                <div className="max-h-64 tabla-scroll rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Fila</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Bodega</TableHead>
                        <TableHead className="text-right">Exhibición</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filasImportar.slice(0, 100).map(f => (
                        <TableRow key={f.fila}>
                          <TableCell className="text-xs">{f.fila}</TableCell>
                          <TableCell className="font-mono text-xs">{f.sku || "-"}</TableCell>
                          <TableCell className="max-w-48 truncate">{f.nombre}{f.es_servicio && <Badge variant="secondary" className="ml-1 text-[10px]">Servicio</Badge>}</TableCell>
                          <TableCell>{f.categoria || "-"}</TableCell>
                          <TableCell className="text-right">{f.cantidad_bodega || 0}</TableCell>
                          <TableCell className="text-right">{f.cantidad_exhibicion || 0}</TableCell>
                          <TableCell className="text-right">{f.costo_unitario || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filasImportar.length > 100 && <p className="text-xs text-muted-foreground">Mostrando las primeras 100 filas de {filasImportar.length}.</p>}
              </>
            )}

            {resultadoImport && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                <p className="font-semibold">Importación completada</p>
                <p>{resultadoImport.creados} productos creados · {resultadoImport.actualizados} actualizados · {resultadoImport.ingresados} con carga inicial de stock.</p>
                {resultadoImport.errores.length > 0 && (
                  <div className="mt-2">
                    <p className="font-semibold text-destructive">{resultadoImport.errores.length} fila(s) con error:</p>
                    <div className="max-h-32 overflow-auto text-xs">
                      {resultadoImport.errores.map((e, i) => <p key={i}>Fila {e.fila}: {e.mensaje}</p>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogImportar(false)}>Cerrar</Button>
            <Button onClick={ejecutarImportacion} disabled={pendiente || !filasImportar.length}>
              {pendiente ? "Importando..." : `Importar ${filasImportar.length} fila(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG NUEVO PROVEEDOR (al vuelo desde Ingreso) */}
      <Dialog open={dialogProveedor} onOpenChange={setDialogProveedor}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo Proveedor</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevoProveedor.nombre} onChange={e => setNuevoProveedor({ ...nuevoProveedor, nombre: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5"><Label>NIT / Identificación</Label><Input value={nuevoProveedor.nit} onChange={e => setNuevoProveedor({ ...nuevoProveedor, nit: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={nuevoProveedor.contacto} onChange={e => setNuevoProveedor({ ...nuevoProveedor, contacto: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Correo</Label><Input value={nuevoProveedor.correo} onChange={e => setNuevoProveedor({ ...nuevoProveedor, correo: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Ciudad</Label><Input value={nuevoProveedor.ciudad} onChange={e => setNuevoProveedor({ ...nuevoProveedor, ciudad: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogProveedor(false)}>Cancelar</Button>
            <Button onClick={guardarNuevoProveedor} disabled={pendiente || !nuevoProveedor.nombre.trim()}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
