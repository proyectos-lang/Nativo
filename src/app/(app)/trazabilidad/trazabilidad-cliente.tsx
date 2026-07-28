"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Bitacora } from "@/lib/tipos";

type Props = { eventos: Bitacora[] };

const NOMBRE_ACCION: Record<string, string> = {
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  pagar: "Pagar",
  cobrar: "Cobrar",
  transferir: "Transferir",
  cambiar_estado: "Cambiar estado",
  cambiar_clave: "Cambiar clave",
};

const VARIANTE_ACCION: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  crear: "default",
  editar: "secondary",
  eliminar: "destructive",
  pagar: "secondary",
  cobrar: "secondary",
  transferir: "outline",
  cambiar_estado: "outline",
  cambiar_clave: "destructive",
};

export function TrazabilidadCliente({ eventos }: Props) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [usuario, setUsuario] = useState("todos");
  const [modulo, setModulo] = useState("todos");
  const [accion, setAccion] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [sel, setSel] = useState<Bitacora | null>(null);

  const usuarios = useMemo(() => [...new Set(eventos.map(e => e.usuario).filter(Boolean))] as string[], [eventos]);
  const modulos = useMemo(() => [...new Set(eventos.map(e => e.modulo).filter(Boolean))], [eventos]);
  const acciones = useMemo(() => [...new Set(eventos.map(e => e.accion).filter(Boolean))], [eventos]);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return eventos.filter(e => {
      const fechaSolo = e.fecha.slice(0, 10);
      if (desde && fechaSolo < desde) return false;
      if (hasta && fechaSolo > hasta) return false;
      if (usuario !== "todos" && e.usuario !== usuario) return false;
      if (modulo !== "todos" && e.modulo !== modulo) return false;
      if (accion !== "todos" && e.accion !== accion) return false;
      if (q && !e.descripcion.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eventos, desde, hasta, usuario, modulo, accion, busqueda]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5"><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Usuario</Label>
            <Select value={usuario} onValueChange={v => setUsuario(v || "todos")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {usuarios.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Módulo</Label>
            <Select value={modulo} onValueChange={v => setModulo(v || "todos")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {modulos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Acción</Label>
            <Select value={accion} onValueChange={v => setAccion(v || "todos")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {acciones.map(a => <SelectItem key={a} value={a}>{NOMBRE_ACCION[a] || a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Buscar</Label><Input placeholder="Descripción..." value={busqueda} onChange={e => setBusqueda(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[650px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(e => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setSel(e)}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(e.fecha).toLocaleString("es-CO")}</TableCell>
                    <TableCell>{e.usuario || "-"}</TableCell>
                    <TableCell className="capitalize">{e.modulo}</TableCell>
                    <TableCell><Badge variant={VARIANTE_ACCION[e.accion] || "outline"}>{NOMBRE_ACCION[e.accion] || e.accion}</Badge></TableCell>
                    <TableCell className="max-w-96 truncate">{e.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{lista.length} de {eventos.length} evento(s).</p>
        </CardContent>
      </Card>

      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sel && (NOMBRE_ACCION[sel.accion] || sel.accion)} — {sel?.descripcion}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-muted-foreground">Fecha y hora</p><p className="font-medium">{new Date(sel.fecha).toLocaleString("es-CO")}</p></div>
                <div><p className="text-muted-foreground">Usuario</p><p className="font-medium">{sel.usuario || "-"}</p></div>
                <div><p className="text-muted-foreground">Módulo</p><p className="font-medium capitalize">{sel.modulo}</p></div>
                <div><p className="text-muted-foreground">Entidad</p><p className="font-medium">{sel.tabla_afectada} #{sel.registro_id}</p></div>
              </div>
              {sel.motivo && (
                <div className="rounded-md border p-2 text-sm"><span className="text-muted-foreground">Motivo: </span>{sel.motivo}</div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {sel.datos_anteriores != null && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Antes</p>
                    <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(sel.datos_anteriores, null, 2)}</pre>
                  </div>
                )}
                {sel.datos_nuevos != null && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">Después</p>
                    <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">{JSON.stringify(sel.datos_nuevos, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
