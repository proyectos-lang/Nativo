"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown } from "lucide-react";
import { formatoPesos, type Producto, type InventarioUbicacion, type InventarioExistencia, type InventarioReserva } from "@/lib/tipos";

type Props = {
  productos: Producto[];
  ubicaciones: InventarioUbicacion[];
  existencias: InventarioExistencia[];
  reservas: InventarioReserva[];
};

type Fila = {
  producto: Producto;
  porUbicacion: Record<number, number>;
  total: number;
  reservado: number;
  pendiente: number;
  disponible: number;
};

export function ExistenciasTab({ productos, ubicaciones, existencias, reservas }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroNivel, setFiltroNivel] = useState("todos");

  const categorias = useMemo(
    () => [...new Set(productos.filter(p => p.controla_inventario).map(p => p.categoria).filter(Boolean))].sort() as string[],
    [productos]
  );

  const filas = useMemo((): Fila[] => {
    const porProducto = new Map<number, Record<number, number>>();
    for (const e of existencias) {
      if (!porProducto.has(e.producto_id)) porProducto.set(e.producto_id, {});
      porProducto.get(e.producto_id)![e.ubicacion_id] = Number(e.cantidad);
    }
    const reservadoPorProducto = new Map<number, { respaldado: number; pendiente: number }>();
    for (const r of reservas) {
      const actual = reservadoPorProducto.get(r.producto_id) || { respaldado: 0, pendiente: 0 };
      actual.respaldado += Number(r.cantidad) - Number(r.cantidad_pendiente);
      actual.pendiente += Number(r.cantidad_pendiente);
      reservadoPorProducto.set(r.producto_id, actual);
    }

    return productos
      .filter(p => p.controla_inventario)
      .map(p => {
        const porUbicacion = porProducto.get(p.id) || {};
        const total = Object.values(porUbicacion).reduce((s, c) => s + c, 0);
        const res = reservadoPorProducto.get(p.id) || { respaldado: 0, pendiente: 0 };
        return {
          producto: p,
          porUbicacion,
          total,
          reservado: res.respaldado,
          pendiente: res.pendiente,
          disponible: total - res.respaldado,
        };
      });
  }, [productos, existencias, reservas]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return filas.filter(f => {
      if (filtroCategoria !== "todas" && f.producto.categoria !== filtroCategoria) return false;
      if (filtroNivel === "agotados" && f.total > 0) return false;
      if (filtroNivel === "bajo_minimo" && !(f.total > 0 && f.total <= Number(f.producto.stock_minimo))) return false;
      if (filtroNivel === "sobre_maximo" && !(f.producto.stock_maximo != null && f.total > Number(f.producto.stock_maximo))) return false;
      if (!q) return true;
      return f.producto.nombre.toLowerCase().includes(q) ||
        (f.producto.sku || "").toLowerCase().includes(q) ||
        (f.producto.categoria || "").toLowerCase().includes(q);
    });
  }, [filas, busqueda, filtroCategoria, filtroNivel]);

  const valorTotal = useMemo(
    () => filas.reduce((s, f) => s + f.total * Number(f.producto.costo_promedio), 0),
    [filas]
  );

  const nivelBadge = (f: Fila) => {
    if (f.total <= 0) return <Badge variant="destructive">Agotado</Badge>;
    if (f.total <= Number(f.producto.stock_minimo)) return <Badge variant="outline" className="border-amber-500/60 text-amber-600">Bajo mínimo</Badge>;
    if (f.producto.stock_maximo != null && f.total > Number(f.producto.stock_maximo)) return <Badge variant="secondary">Sobre máximo</Badge>;
    return <Badge variant="default">OK</Badge>;
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const filasExcel = lista.map(f => ({
      SKU: f.producto.sku || "",
      Producto: f.producto.nombre,
      Categoria: f.producto.categoria || "",
      Talla: f.producto.talla || "",
      Color: f.producto.color || "",
      ...Object.fromEntries(ubicaciones.map(u => [u.nombre, f.porUbicacion[u.id] || 0])),
      Total: f.total,
      Reservado: f.reservado,
      "Pendiente por surtir": f.pendiente,
      Disponible: f.disponible,
      "Stock Minimo": f.producto.stock_minimo,
      "Stock Maximo": f.producto.stock_maximo ?? "",
      "Costo Promedio": f.producto.costo_promedio,
      "Valor Total": f.total * Number(f.producto.costo_promedio),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasExcel), "Existencias");
    XLSX.writeFile(wb, `Existencias_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filas.length} referencias con control de inventario · Valor total: <span className="font-bold text-foreground">{formatoPesos(valorTotal)}</span>
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Input className="w-56" placeholder="Buscar por SKU, nombre..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          <Select value={filtroCategoria} onValueChange={v => setFiltroCategoria(v || "todas")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtroNivel} onValueChange={v => setFiltroNivel(v || "todos")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los niveles</SelectItem>
              <SelectItem value="agotados">Agotados</SelectItem>
              <SelectItem value="bajo_minimo">Bajo mínimo</SelectItem>
              <SelectItem value="sobre_maximo">Sobre máximo</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportar}><FileDown className="size-4" /> Excel</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  {ubicaciones.map(u => <TableHead key={u.id} className="text-right">{u.nombre}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Mín / Máx</TableHead>
                  <TableHead>Nivel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={7 + ubicaciones.length} className="py-8 text-center text-muted-foreground">
                    Sin productos con control de inventario. Crea o enrola productos en la pestaña Productos.
                  </TableCell></TableRow>
                )}
                {lista.map(f => (
                  <TableRow key={f.producto.id}>
                    <TableCell className="font-mono text-xs">{f.producto.sku || "-"}</TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate font-medium">{f.producto.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[f.producto.categoria, f.producto.talla && `Talla ${f.producto.talla}`, f.producto.color].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    {ubicaciones.map(u => (
                      <TableCell key={u.id} className="text-right">{f.porUbicacion[u.id] || 0}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{f.total}</TableCell>
                    <TableCell className="text-right">
                      {f.reservado}
                      {f.pendiente > 0 && <span className="block text-xs text-destructive">+{f.pendiente} por surtir</span>}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${f.disponible <= 0 ? "text-destructive" : ""}`}>{f.disponible}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {f.producto.stock_minimo} / {f.producto.stock_maximo ?? "∞"}
                    </TableCell>
                    <TableCell>{nivelBadge(f)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
