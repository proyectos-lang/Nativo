"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearUbicacion, actualizarUbicacion } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Warehouse } from "lucide-react";
import type { InventarioUbicacion, InventarioExistencia } from "@/lib/tipos";

export function BodegasTab({ ubicaciones, existencias }: {
  ubicaciones: InventarioUbicacion[];
  existencias: InventarioExistencia[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<InventarioUbicacion | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const stockPorUbicacion = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of existencias) m.set(e.ubicacion_id, (m.get(e.ubicacion_id) || 0) + Number(e.cantidad));
    return m;
  }, [existencias]);

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
    const nombre = nueva.trim();
    if (!nombre) return;
    correr(() => crearUbicacion(nombre), `Bodega "${nombre}" creada`, () => setNueva(""));
  };

  const alternarActiva = (u: InventarioUbicacion) => {
    correr(
      () => actualizarUbicacion(u.id, { activa: !u.activa }),
      u.activa ? `"${u.nombre}" inactivada (deja de aparecer en los selectores)` : `"${u.nombre}" activada`,
    );
  };

  const guardarEdicion = () => {
    if (!editando) return;
    correr(() => actualizarUbicacion(editando.id, { nombre: nombreEditado }), "Bodega actualizada", () => setEditando(null));
  };

  return (
    <div className="mt-2 grid gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Warehouse className="size-4" /> Gestiona tus bodegas / ubicaciones. Una bodega inactiva desaparece de los selectores sin afectar el historial.
            </p>
            <div className="flex items-end gap-2">
              <Input
                className="w-56" placeholder="Nueva bodega..." value={nueva}
                onChange={e => setNueva(e.target.value)}
                onKeyDown={e => e.key === "Enter" && agregar()}
              />
              <Button onClick={agregar} disabled={pendiente || !nueva.trim()}><Plus className="size-4" /> Agregar</Button>
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bodega / Ubicación</TableHead>
                  <TableHead className="text-right">Unidades en stock</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-center">Activa</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ubicaciones.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin bodegas.</TableCell></TableRow>
                )}
                {ubicaciones.map(u => (
                  <TableRow key={u.id} className={u.activa ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{u.nombre}</TableCell>
                    <TableCell className="text-right">{stockPorUbicacion.get(u.id) || 0}</TableCell>
                    <TableCell><Badge variant={u.activa ? "default" : "secondary"}>{u.activa ? "Activa" : "Inactiva"}</Badge></TableCell>
                    <TableCell className="text-center">
                      <Switch checked={u.activa} onCheckedChange={() => alternarActiva(u)} disabled={pendiente} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Renombrar" disabled={pendiente} onClick={() => { setEditando(u); setNombreEditado(u.nombre); }}>
                        <Pencil className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG RENOMBRAR */}
      <Dialog open={!!editando} onOpenChange={o => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Renombrar bodega</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Input value={nombreEditado} onChange={e => setNombreEditado(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarEdicion()} autoFocus />
            <p className="text-xs text-muted-foreground">Renombrar no altera los movimientos históricos que ya usaron el nombre anterior.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente || !nombreEditado.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
