"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { registrarPago } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatoPesos, formatoFecha, type Venta, type Pago, type CuentaBancaria } from "@/lib/tipos";

export function PagosCliente({ ventas, pagos, cuentas }: { ventas: Venta[]; pagos: Record<number, Pago[]>; cuentas: CuentaBancaria[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("pendientes");
  const [sel, setSel] = useState<Venta | null>(null);
  const [abono, setAbono] = useState(0);
  const [retefuente, setRetefuente] = useState(0);
  const [reteiva, setReteiva] = useState(0);
  const [reteica, setReteica] = useState(0);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [comentario, setComentario] = useState("");
  const [cuentaId, setCuentaId] = useState(0);

  const totalRetenciones = (Number(retefuente) || 0) + (Number(reteiva) || 0) + (Number(reteica) || 0);

  const lista = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return ventas.filter(v => {
      if (filtroEstado === "pendientes" && v.saldo <= 0) return false;
      if (filtroEstado === "pagados" && v.saldo > 0) return false;
      if (!q) return true;
      return (v.clientes?.nombre || "").toLowerCase().includes(q) ||
        (v.clientes?.empresa || "").toLowerCase().includes(q) ||
        String(v.ticket) === q;
    });
  }, [ventas, busqueda, filtroEstado]);

  const totalPorCobrar = useMemo(
    () => ventas.reduce((s, v) => s + (v.saldo > 0 ? v.saldo : 0), 0),
    [ventas]
  );

  const abrir = (v: Venta) => {
    setSel(v); setAbono(0); setRetefuente(0); setReteiva(0); setReteica(0);
    setFecha(new Date().toISOString().slice(0, 10)); setComentario(""); setCuentaId(0);
  };

  const procesar = () => {
    if (!sel) return;
    startTransition(async () => {
      try {
        await registrarPago({ venta_id: sel.id, abono, retefuente, reteiva, reteica, fecha, comentario, cuenta_id: cuentaId || null });
        toast.success(`Pago aplicado al ticket #${sel.ticket}`);
        setSel(null);
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  };

  const nuevoSaldo = sel ? sel.saldo - abono - totalRetenciones : 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Pagos</h2>
          <p className="text-sm text-muted-foreground">
            Total por cobrar: <span className="font-bold text-destructive">{formatoPesos(totalPorCobrar)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Buscar</Label>
            <Input className="w-56" placeholder="Ticket, cliente o empresa..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Mostrar</Label>
            <Select value={filtroEstado} onValueChange={v => setFiltroEstado(v || "pendientes")}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendientes">Pendientes por pagar</SelectItem>
                <SelectItem value="pagados">Pagados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total Base</TableHead>
                  <TableHead className="text-right">Retención</TableHead>
                  <TableHead className="text-right">Abonado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sin resultados.</TableCell></TableRow>
                )}
                {lista.map(v => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => abrir(v)}>
                    <TableCell className="font-semibold">#{v.ticket}</TableCell>
                    <TableCell>
                      {v.clientes?.nombre || "-"}
                      {v.clientes?.empresa && <span className="block text-xs text-muted-foreground">{v.clientes.empresa}</span>}
                    </TableCell>
                    <TableCell className="text-right">{formatoPesos(v.total_compra)}</TableCell>
                    <TableCell className="text-right">{formatoPesos(v.retencion)}</TableCell>
                    <TableCell className="text-right">{formatoPesos(v.abono)}</TableCell>
                    <TableCell className={`text-right font-bold ${v.saldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(v.saldo)}</TableCell>
                    <TableCell><Badge variant={v.saldo <= 0 ? "default" : "secondary"}>{v.estado_pago || "-"}</Badge></TableCell>
                    <TableCell><Button variant="outline" size="sm">Abonar</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ticket #{sel?.ticket} — {sel?.clientes?.nombre}</DialogTitle>
          </DialogHeader>
          {sel && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-muted-foreground">Total Base</p><p className="font-bold">{formatoPesos(sel.total_compra)}</p></div>
                <div><p className="text-muted-foreground">Retención</p><p className="font-bold">{formatoPesos(sel.retencion)}</p></div>
                <div><p className="text-muted-foreground">Abonado</p><p className="font-bold">{formatoPesos(sel.abono)}</p></div>
                <div><p className="text-muted-foreground">Saldo</p><p className="font-bold text-destructive">{formatoPesos(sel.saldo)}</p></div>
              </div>

              {(pagos[sel.id]?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-sm font-semibold">Historial de pagos</p>
                  <div className="max-h-36 tabla-scroll rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead><TableHead className="text-right">Abono</TableHead>
                          <TableHead className="text-right">Retención</TableHead><TableHead>Comentario</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagos[sel.id].map(p => (
                          <TableRow key={p.id}>
                            <TableCell>{formatoFecha(p.fecha)}</TableCell>
                            <TableCell className="text-right">{formatoPesos(p.abono)}</TableCell>
                            <TableCell className="text-right">{formatoPesos(p.retencion)}</TableCell>
                            <TableCell className="max-w-52 truncate text-xs">{p.comentario || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label>Nuevo Abono ($)</Label><Input type="number" min={0} value={abono || ""} onChange={e => setAbono(Number(e.target.value))} placeholder="0" /></div>
                <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></div>
              </div>
              <div className="grid gap-2 rounded-md border p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Retenciones ($)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5"><Label>Retefuente</Label><Input type="number" min={0} value={retefuente || ""} onChange={e => setRetefuente(Number(e.target.value))} placeholder="0" /></div>
                  <div className="grid gap-1.5"><Label>ReteIVA</Label><Input type="number" min={0} value={reteiva || ""} onChange={e => setReteiva(Number(e.target.value))} placeholder="0" /></div>
                  <div className="grid gap-1.5"><Label>ReteICA</Label><Input type="number" min={0} value={reteica || ""} onChange={e => setReteica(Number(e.target.value))} placeholder="0" /></div>
                </div>
                {totalRetenciones > 0 && <p className="text-xs text-muted-foreground">Total retenciones: <span className="font-semibold">{formatoPesos(totalRetenciones)}</span> — reducen el saldo pero no entran a la cuenta bancaria.</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5"><Label>Comentario / Medio de pago</Label><Input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej. Transferencia Bancolombia #123" /></div>
                <div className="grid gap-1.5">
                  <Label>Cuenta destino del abono</Label>
                  <Select value={cuentaId ? String(cuentaId) : ""} onValueChange={v => setCuentaId(v ? Number(v) : 0)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Sin cuenta (no genera movimiento bancario)" /></SelectTrigger>
                    <SelectContent>
                      {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-sm">
                Nuevo saldo proyectado:{" "}
                <span className={`font-bold ${nuevoSaldo > 0 ? "text-destructive" : "text-primary"}`}>{formatoPesos(nuevoSaldo)}</span>
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSel(null)}>Cancelar</Button>
            <Button onClick={procesar} disabled={pendiente || (abono <= 0 && totalRetenciones <= 0)}>
              {pendiente ? "Procesando..." : "Aplicar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
