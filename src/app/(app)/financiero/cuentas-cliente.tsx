"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { guardarCuenta, registrarMovimientoManual, transferir } from "./acciones";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Landmark, Pencil, ArrowLeftRight, PlusCircle, ReceiptText } from "lucide-react";
import { formatoPesos, formatoFecha, NOMBRE_ORIGEN_MOVIMIENTO, type CuentaBancaria, type MovimientoBancario } from "@/lib/tipos";

type Props = { cuentas: CuentaBancaria[]; movimientos: MovimientoBancario[] };

const HOY = () => new Date().toISOString().slice(0, 10);

export function CuentasCliente({ cuentas, movimientos }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const activas = useMemo(() => cuentas.filter(c => c.activa), [cuentas]);

  // Crear/editar cuenta
  const [dialogCuenta, setDialogCuenta] = useState(false);
  const [formCuenta, setFormCuenta] = useState({ id: 0, nombre: "", banco: "", numero_cuenta: "", saldo_inicial: 0, activa: true });

  // Movimiento manual
  const [dialogMov, setDialogMov] = useState(false);
  const [formMov, setFormMov] = useState({ cuenta_id: 0, tipo: "ingreso" as "ingreso" | "egreso", monto: 0, fecha: HOY(), concepto: "" });

  // Transferencia
  const [dialogTransf, setDialogTransf] = useState(false);
  const [formTransf, setFormTransf] = useState({ origen: 0, destino: 0, monto: 0, fecha: HOY(), concepto: "" });

  // Extracto
  const [extractoDe, setExtractoDe] = useState<CuentaBancaria | null>(null);
  const movsCuenta = useMemo(
    () => (extractoDe ? movimientos.filter(m => m.cuenta_id === extractoDe.id) : []),
    [movimientos, extractoDe]
  );

  const correr = (fn: () => Promise<void>, exito: string, cerrar: () => void) => {
    startTransition(async () => {
      try {
        await fn();
        toast.success(exito);
        cerrar();
        router.refresh();
      } catch (e) { toast.error((e as Error).message); }
    });
  };

  const abrirCuenta = (c?: CuentaBancaria) => {
    setFormCuenta(c
      ? { id: c.id, nombre: c.nombre, banco: c.banco || "", numero_cuenta: c.numero_cuenta || "", saldo_inicial: Number(c.saldo_inicial), activa: c.activa }
      : { id: 0, nombre: "", banco: "", numero_cuenta: "", saldo_inicial: 0, activa: true });
    setDialogCuenta(true);
  };

  const SelectorCuenta = ({ valor, onCambio, excluir }: { valor: number; onCambio: (id: number) => void; excluir?: number }) => (
    <Select value={valor ? String(valor) : ""} onValueChange={v => v && onCambio(Number(v))}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Seleccione cuenta..." /></SelectTrigger>
      <SelectContent>
        {activas.filter(c => c.id !== excluir).map(c => (
          <SelectItem key={c.id} value={String(c.id)}>{c.nombre} ({formatoPesos(c.saldo_actual)})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => { setFormMov({ cuenta_id: 0, tipo: "ingreso", monto: 0, fecha: HOY(), concepto: "" }); setDialogMov(true); }}>
          <PlusCircle className="size-4" /> Movimiento Manual
        </Button>
        <Button variant="outline" onClick={() => { setFormTransf({ origen: 0, destino: 0, monto: 0, fecha: HOY(), concepto: "" }); setDialogTransf(true); }}>
          <ArrowLeftRight className="size-4" /> Transferencia
        </Button>
        <Button onClick={() => abrirCuenta()}>
          <Landmark className="size-4" /> Nueva Cuenta
        </Button>
      </div>

      <Card>
        <CardContent className="pt-2">
          <div className="tabla-scroll rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-right">Saldo Actual</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuentas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No hay cuentas registradas. Crea la primera con &quot;Nueva Cuenta&quot;.</TableCell></TableRow>
                )}
                {cuentas.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.banco || "-"}</TableCell>
                    <TableCell>{c.numero_cuenta || "-"}</TableCell>
                    <TableCell className="text-right">{formatoPesos(c.saldo_inicial)}</TableCell>
                    <TableCell className={`text-right font-bold ${(c.saldo_actual || 0) >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(c.saldo_actual)}</TableCell>
                    <TableCell><Badge variant={c.activa ? "outline" : "destructive"}>{c.activa ? "Activa" : "Inactiva"}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" title="Ver extracto" onClick={() => setExtractoDe(c)}><ReceiptText className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Editar" onClick={() => abrirCuenta(c)}><Pencil className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG CUENTA */}
      <Dialog open={dialogCuenta} onOpenChange={setDialogCuenta}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{formCuenta.id ? "Editar Cuenta" : "Nueva Cuenta Bancaria"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Nombre *</Label><Input value={formCuenta.nombre} onChange={e => setFormCuenta({ ...formCuenta, nombre: e.target.value })} placeholder="Ej. Bancolombia Ahorros" /></div>
            <div className="grid gap-1.5"><Label>Banco</Label><Input value={formCuenta.banco} onChange={e => setFormCuenta({ ...formCuenta, banco: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Número de cuenta</Label><Input value={formCuenta.numero_cuenta} onChange={e => setFormCuenta({ ...formCuenta, numero_cuenta: e.target.value })} /></div>
            <div className="grid gap-1.5">
              <Label>Saldo inicial</Label>
              <Input type="number" value={formCuenta.saldo_inicial || ""} onChange={e => setFormCuenta({ ...formCuenta, saldo_inicial: Number(e.target.value) })} placeholder="0" disabled={!!formCuenta.id} />
              {!!formCuenta.id && <p className="text-xs text-muted-foreground">El saldo inicial no se edita; usa movimientos manuales para ajustes.</p>}
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Switch checked={formCuenta.activa} onCheckedChange={v => setFormCuenta({ ...formCuenta, activa: v })} />
              Cuenta activa
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCuenta(false)}>Cancelar</Button>
            <Button disabled={pendiente || !formCuenta.nombre.trim()} onClick={() =>
              correr(() => guardarCuenta({ ...formCuenta, id: formCuenta.id || undefined }), "Cuenta guardada", () => setDialogCuenta(false))
            }>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG MOVIMIENTO MANUAL */}
      <Dialog open={dialogMov} onOpenChange={setDialogMov}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Movimiento Manual</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 grid gap-1.5"><Label>Cuenta *</Label><SelectorCuenta valor={formMov.cuenta_id} onCambio={id => setFormMov({ ...formMov, cuenta_id: id })} /></div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={formMov.tipo} onValueChange={v => v && setFormMov({ ...formMov, tipo: v as "ingreso" | "egreso" })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso (entrada)</SelectItem>
                  <SelectItem value="egreso">Egreso (salida)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" min={0} value={formMov.monto || ""} onChange={e => setFormMov({ ...formMov, monto: Number(e.target.value) })} placeholder="0" /></div>
            <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={formMov.fecha} onChange={e => setFormMov({ ...formMov, fecha: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Concepto</Label><Input value={formMov.concepto} onChange={e => setFormMov({ ...formMov, concepto: e.target.value })} placeholder="Ej. Consignación inicial" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMov(false)}>Cancelar</Button>
            <Button disabled={pendiente || !formMov.cuenta_id || formMov.monto <= 0} onClick={() =>
              correr(() => registrarMovimientoManual(formMov), "Movimiento registrado", () => setDialogMov(false))
            }>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG TRANSFERENCIA */}
      <Dialog open={dialogTransf} onOpenChange={setDialogTransf}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Transferencia entre Cuentas</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label>Cuenta origen *</Label><SelectorCuenta valor={formTransf.origen} onCambio={id => setFormTransf({ ...formTransf, origen: id })} excluir={formTransf.destino} /></div>
            <div className="grid gap-1.5"><Label>Cuenta destino *</Label><SelectorCuenta valor={formTransf.destino} onCambio={id => setFormTransf({ ...formTransf, destino: id })} excluir={formTransf.origen} /></div>
            <div className="grid gap-1.5"><Label>Monto *</Label><Input type="number" min={0} value={formTransf.monto || ""} onChange={e => setFormTransf({ ...formTransf, monto: Number(e.target.value) })} placeholder="0" /></div>
            <div className="grid gap-1.5"><Label>Fecha</Label><Input type="date" value={formTransf.fecha} onChange={e => setFormTransf({ ...formTransf, fecha: e.target.value })} /></div>
            <div className="col-span-2 grid gap-1.5"><Label>Concepto</Label><Input value={formTransf.concepto} onChange={e => setFormTransf({ ...formTransf, concepto: e.target.value })} placeholder="Ej. Traslado a caja menor" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTransf(false)}>Cancelar</Button>
            <Button disabled={pendiente || !formTransf.origen || !formTransf.destino || formTransf.monto <= 0} onClick={() =>
              correr(() => transferir(formTransf), "Transferencia realizada", () => setDialogTransf(false))
            }>Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG EXTRACTO */}
      <Dialog open={!!extractoDe} onOpenChange={o => !o && setExtractoDe(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Extracto — {extractoDe?.nombre} · Saldo actual:{" "}
              <span className={(extractoDe?.saldo_actual || 0) >= 0 ? "text-primary" : "text-destructive"}>
                {formatoPesos(extractoDe?.saldo_actual)}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] tabla-scroll rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Cliente / Proveedor</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Egreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movsCuenta.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Sin movimientos.</TableCell></TableRow>
                )}
                {movsCuenta.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{formatoFecha(m.fecha)}</TableCell>
                    <TableCell><Badge variant="secondary">{NOMBRE_ORIGEN_MOVIMIENTO[m.origen] || m.origen}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate text-sm font-medium">{m.tercero || "-"}</TableCell>
                    <TableCell className="max-w-32 truncate text-sm">{m.factura || "-"}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">{m.concepto || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{m.tipo === "ingreso" ? formatoPesos(m.monto) : ""}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{m.tipo === "egreso" ? formatoPesos(m.monto) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">Saldo inicial de la cuenta: {formatoPesos(extractoDe?.saldo_inicial)}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
