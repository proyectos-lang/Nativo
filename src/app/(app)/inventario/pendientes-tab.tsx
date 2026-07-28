"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatoFecha, type InventarioReserva } from "@/lib/tipos";

type Props = {
  reservas: InventarioReserva[];
};

export function PendientesTab({ reservas }: Props) {
  const [busqueda, setBusqueda] = useState("");

  const diasDesde = (fecha: string) => Math.floor((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(fecha.slice(0, 10))) / 86400000);

  const { pendientes, respaldadas } = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    const filtradas = reservas.filter(r =>
      !q || r.producto.toLowerCase().includes(q) || String(r.ticket).includes(q)
    );
    return {
      pendientes: filtradas.filter(r => Number(r.cantidad_pendiente) > 0),
      respaldadas: filtradas.filter(r => Number(r.cantidad_pendiente) === 0),
    };
  }, [reservas, busqueda]);

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} por surtir · {respaldadas.length} reserva{respaldadas.length === 1 ? "" : "s"} con stock listas para despachar.
        </p>
        <Input className="w-64" placeholder="Buscar por producto o ticket..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <Card className={pendientes.length ? "border-destructive/40" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pendientes por surtir (compras pendientes)</CardTitle>
          <p className="text-sm text-muted-foreground">Ventas sin inventario esperando mercancía. Se surten automáticamente (más antiguas primero) con cada ingreso.</p>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Reservado</TableHead>
                  <TableHead className="text-right">Pendiente por surtir</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No hay pedidos pendientes por surtir. 🎉</TableCell></TableRow>
                )}
                {pendientes.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">#{r.ticket}</TableCell>
                    <TableCell className="max-w-56 truncate">{r.producto}</TableCell>
                    <TableCell className="text-right">{r.cantidad}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{r.cantidad_pendiente}</TableCell>
                    <TableCell>{formatoFecha(r.creado_en.slice(0, 10))}</TableCell>
                    <TableCell className="text-right font-bold">{diasDesde(r.creado_en)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reservas activas con respaldo</CardTitle>
          <p className="text-sm text-muted-foreground">Stock comprometido en pedidos aún no entregados (se descuenta físicamente al marcar Entregado).</p>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Reservado desde</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {respaldadas.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Sin reservas activas.</TableCell></TableRow>
                )}
                {respaldadas.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-semibold">#{r.ticket}</TableCell>
                    <TableCell className="max-w-56 truncate">{r.producto}</TableCell>
                    <TableCell className="text-right">{r.cantidad}</TableCell>
                    <TableCell>{formatoFecha(r.creado_en.slice(0, 10))}</TableCell>
                    <TableCell><Badge variant="default">Lista para despachar</Badge></TableCell>
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
