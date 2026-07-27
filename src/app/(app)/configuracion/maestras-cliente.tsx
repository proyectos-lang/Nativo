"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { agregarValorMaestro, actualizarValorMaestro, eliminarValorMaestro } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, X } from "lucide-react";

const NOMBRES_TIPO: Record<string, string> = {
  vendedora: "Vendedoras",
  talla: "Tallas",
  color: "Colores",
  campana: "Campañas",
  motivo_compra: "Motivos de Compra",
  profesional: "Profesionales / Asesores",
  estado_entrega: "Estados de Entrega",
  canal_venta: "Canales de Venta",
  estado_pago: "Estados de Pago",
  medio_pago: "Medios de Pago",
  tipo_pago: "Tipos de Pago",
  sexo: "Sexo",
  categoria_gasto: "Categorías de Gastos",
  categoria_ingreso: "Categorías de Ingresos",
  causal_devolucion: "Causales de Devolución",
  transportadora: "Transportadoras",
  taller: "Talleres / Ubicaciones de proceso",
  unidad_medida: "Unidades de Medida",
  categoria_producto: "Categorías de Producto (Inventario)",
  tipo_manga: "Tipos de Manga",
  motivo_ajuste: "Motivos de Ajuste de Inventario",
  motivo_traslado: "Motivos de Traslado de Inventario",
  categoria_activo: "Categorías de Activos",
  ubicacion_activo: "Ubicaciones de Activos",
  motivo_baja_activo: "Motivos de Baja de Activos",
  area_activo: "Áreas de Activos",
  estado_activo: "Estado / Condición de Activos",
  tipo_proveedor: "Tipos de Proveedor",
  area_solicitud: "Áreas de Solicitudes",
};

type ValorMaestro = { id: number; tipo: string; valor: string; activo: boolean };

export function MaestrasCliente({ valores }: { valores: ValorMaestro[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [tipoSel, setTipoSel] = useState<string>(Object.keys(NOMBRES_TIPO)[0]);
  const [nuevoValor, setNuevoValor] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // Edición de un valor
  const [editando, setEditando] = useState<ValorMaestro | null>(null);
  const [valorEditado, setValorEditado] = useState("");

  const grupos = useMemo(() => {
    const g: Record<string, ValorMaestro[]> = {};
    for (const v of valores) {
      if (!g[v.tipo]) g[v.tipo] = [];
      g[v.tipo].push(v);
    }
    return g;
  }, [valores]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return (grupos[tipoSel] || []).filter(v => !q || v.valor.toLowerCase().includes(q));
  }, [grupos, tipoSel, busqueda]);

  const correr = (fn: () => Promise<unknown>, exito: string, despues?: () => void) => {
    startTransition(async () => {
      try {
        await fn();
        toast.success(exito);
        despues?.();
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const agregar = () => {
    const valor = nuevoValor.trim();
    if (!valor) return;
    correr(() => agregarValorMaestro(tipoSel, valor), `"${valor}" agregado`, () => setNuevoValor(""));
  };

  const alternarActivo = (v: ValorMaestro) => {
    correr(
      () => actualizarValorMaestro(v.id, { activo: !v.activo }),
      v.activo ? `"${v.valor}" inactivado (deja de aparecer en los selectores)` : `"${v.valor}" activado`,
    );
  };

  const eliminar = (v: ValorMaestro) => {
    if (!confirm(`¿Eliminar "${v.valor}" definitivamente?\n\nSi el valor se usó en registros históricos, considera inactivarlo en su lugar.`)) return;
    correr(() => eliminarValorMaestro(v.id), "Valor eliminado");
  };

  const guardarEdicion = () => {
    if (!editando) return;
    correr(
      () => actualizarValorMaestro(editando.id, { valor: valorEditado }),
      "Valor actualizado (los registros históricos no cambian)",
      () => setEditando(null),
    );
  };

  const totalActivos = (grupos[tipoSel] || []).filter(v => v.activo).length;

  return (
    <div className="mt-2 grid gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 pb-2">
          <div className="grid gap-1.5">
            <CardTitle className="text-base">Lista</CardTitle>
            <Select value={tipoSel} onValueChange={v => { if (v) { setTipoSel(v); setBusqueda(""); setNuevoValor(""); } }}>
              <SelectTrigger className="w-80"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NOMBRES_TIPO).map(([clave, nombre]) => (
                  <SelectItem key={clave} value={clave}>
                    {nombre} ({(grupos[clave] || []).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input className="w-48" placeholder="Buscar valor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <Input
              className="w-48"
              placeholder="Nuevo valor..."
              value={nuevoValor}
              onChange={e => setNuevoValor(e.target.value)}
              onKeyDown={e => e.key === "Enter" && agregar()}
            />
            <Button onClick={agregar} disabled={pendiente || !nuevoValor.trim()}><Plus className="size-4" /> Agregar</Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm text-muted-foreground">
            {NOMBRES_TIPO[tipoSel]}: {totalActivos} activo{totalActivos === 1 ? "" : "s"} de {(grupos[tipoSel] || []).length}. Un valor inactivo desaparece de los selectores sin afectar registros históricos.
          </p>
          <div className="max-h-[480px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Sin valores en esta lista.</TableCell></TableRow>
                )}
                {lista.map(v => (
                  <TableRow key={v.id} className={v.activo ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{v.valor}</TableCell>
                    <TableCell><Badge variant={v.activo ? "default" : "secondary"}>{v.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                    <TableCell className="text-center">
                      <Switch checked={v.activo} onCheckedChange={() => alternarActivo(v)} disabled={pendiente} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Editar" disabled={pendiente} onClick={() => { setEditando(v); setValorEditado(v.valor); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" title="Eliminar" disabled={pendiente} onClick={() => eliminar(v)}>
                        <X className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG EDITAR VALOR */}
      <Dialog open={!!editando} onOpenChange={o => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar valor de {NOMBRES_TIPO[editando?.tipo || ""] || editando?.tipo}</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Input value={valorEditado} onChange={e => setValorEditado(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarEdicion()} autoFocus />
            <p className="text-xs text-muted-foreground">Renombrar no altera los registros históricos que ya usaron el valor anterior.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente || !valorEditado.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
