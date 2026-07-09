"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { crearProspecto, actualizarProspecto } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { formatoFecha, type Prospecto } from "@/lib/tipos";

const ESTADOS = ["Pendiente", "Contactado", "Venta Cerrada", "Descartado"];

export function ProspectosCliente({ prospectos }: { prospectos: Prospecto[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [verCerrados, setVerCerrados] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", telefono: "", correo: "", referido_por: "", evento_lugar: "", descripcion: "" });
  const [sel, setSel] = useState<Prospecto | null>(null);
  const [edicion, setEdicion] = useState({ estado: "", fecha_contacto: "", proximo_contacto: "", observacion: "" });

  const lista = useMemo(
    () => prospectos.filter(p => verCerrados || p.estado !== "Venta Cerrada"),
    [prospectos, verCerrados]
  );

  const guardarNuevo = () => {
    startTransition(async () => {
      try {
        await crearProspecto(nuevo);
        toast.success("Prospecto guardado");
        setNuevo({ nombre: "", telefono: "", correo: "", referido_por: "", evento_lugar: "", descripcion: "" });
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirEdicion = (p: Prospecto) => {
    setSel(p);
    setEdicion({ estado: p.estado, fecha_contacto: p.fecha_contacto || "", proximo_contacto: p.proximo_contacto || "", observacion: "" });
  };

  const guardarEdicion = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await actualizarProspecto({ id: sel.id, ...edicion });
        toast.success("Prospecto actualizado");
        setSel(null);
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const colorEstado = (e: string) =>
    e === "Contactado" ? "default" : e === "Venta Cerrada" ? "default" : e === "Descartado" ? "destructive" : "secondary";

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle>Registrar Prospecto</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Teléfono</Label><Input value={nuevo.telefono} onChange={e => setNuevo({ ...nuevo, telefono: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Correo</Label><Input value={nuevo.correo} onChange={e => setNuevo({ ...nuevo, correo: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Referido por</Label><Input value={nuevo.referido_por} onChange={e => setNuevo({ ...nuevo, referido_por: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Evento / Lugar</Label><Input value={nuevo.evento_lugar} onChange={e => setNuevo({ ...nuevo, evento_lugar: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Descripción</Label><Textarea rows={2} value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} /></div>
          <Button onClick={guardarNuevo} disabled={pendiente || !nuevo.nombre.trim()}>Registrar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Clientes por Contactar</CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={verCerrados} onCheckedChange={setVerCerrados} />
            Ver ventas cerradas
          </label>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Próx. Contacto</TableHead>
                  <TableHead>Observaciones</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No hay prospectos.</TableCell></TableRow>
                )}
                {lista.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{formatoFecha(p.fecha)}</TableCell>
                    <TableCell className="font-medium">
                      {p.nombre}
                      {(p.referido_por || p.evento_lugar) && (
                        <span className="block text-xs text-muted-foreground">
                          {p.referido_por && `Ref: ${p.referido_por}`} {p.evento_lugar && `· ${p.evento_lugar}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.telefono || "-"}
                      {p.correo && <span className="block text-xs text-muted-foreground">{p.correo}</span>}
                    </TableCell>
                    <TableCell><Badge variant={colorEstado(p.estado)}>{p.estado}</Badge></TableCell>
                    <TableCell>{formatoFecha(p.proximo_contacto)}</TableCell>
                    <TableCell className="max-w-64 whitespace-pre-wrap text-xs">{p.observaciones || "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicion(p)}><Pencil className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Actualizar Prospecto — {sel?.nombre}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Estado</Label>
              <Select value={edicion.estado} onValueChange={v => setEdicion({ ...edicion, estado: v || edicion.estado })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Fecha contacto realizado</Label><Input type="date" value={edicion.fecha_contacto} onChange={e => setEdicion({ ...edicion, fecha_contacto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Próximo contacto</Label><Input type="date" value={edicion.proximo_contacto} onChange={e => setEdicion({ ...edicion, proximo_contacto: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Agregar observación</Label><Textarea rows={2} value={edicion.observacion} onChange={e => setEdicion({ ...edicion, observacion: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={pendiente}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
