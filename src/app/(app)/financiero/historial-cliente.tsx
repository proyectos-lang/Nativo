"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";
import { formatoPesos, formatoFecha, NOMBRE_ORIGEN_MOVIMIENTO, type CuentaBancaria, type MovimientoBancario } from "@/lib/tipos";

type Props = { cuentas: CuentaBancaria[]; movimientos: MovimientoBancario[] };

type FilaHistorial = {
  id: string;
  cuenta_id: number;
  fecha: string;
  tipo: "ingreso" | "egreso";
  origen: string;
  monto: number;
  concepto: string | null;
  tercero: string | null;
};

const NOMBRES_ORIGEN_EXTENDIDO: Record<string, string> = { ...NOMBRE_ORIGEN_MOVIMIENTO, saldo_inicial: "Saldo Inicial" };

export function HistorialCliente({ cuentas, movimientos }: Props) {
  const [cuentaId, setCuentaId] = useState("todas");
  const [origen, setOrigen] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const nombreCuenta = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cuentas) m.set(c.id, c.nombre);
    return m;
  }, [cuentas]);

  const todasLasFilas = useMemo((): FilaHistorial[] => {
    const filasSaldoInicial: FilaHistorial[] = cuentas.map(c => ({
      id: `saldo-${c.id}`,
      cuenta_id: c.id,
      fecha: c.creado_en.slice(0, 10),
      tipo: Number(c.saldo_inicial) >= 0 ? "ingreso" : "egreso",
      origen: "saldo_inicial",
      monto: Math.abs(Number(c.saldo_inicial)),
      concepto: "Saldo inicial de la cuenta",
      tercero: null,
    }));
    const filasMovimientos: FilaHistorial[] = movimientos.map(m => ({
      id: String(m.id), cuenta_id: m.cuenta_id, fecha: m.fecha, tipo: m.tipo, origen: m.origen, monto: Number(m.monto), concepto: m.concepto,
      tercero: m.tercero ?? null,
    }));
    return [...filasSaldoInicial, ...filasMovimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [cuentas, movimientos]);

  const filtrados = useMemo(() => {
    return todasLasFilas.filter(m => {
      if (cuentaId !== "todas" && m.cuenta_id !== Number(cuentaId)) return false;
      if (origen !== "todas" && m.origen !== origen) return false;
      if (desde && m.fecha < desde) return false;
      if (hasta && m.fecha > hasta) return false;
      return true;
    });
  }, [todasLasFilas, cuentaId, origen, desde, hasta]);

  const totalIngresos = filtrados.filter(m => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
  const totalEgresos = filtrados.filter(m => m.tipo === "egreso").reduce((s, m) => s + Number(m.monto), 0);

  const limpiar = () => { setCuentaId("todas"); setOrigen("todas"); setDesde(""); setHasta(""); };
  const hayFiltros = cuentaId !== "todas" || origen !== "todas" || !!desde || !!hasta;

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={v => v && setCuentaId(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuentas</SelectItem>
                {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo de movimiento</Label>
            <Select value={origen} onValueChange={v => v && setOrigen(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos</SelectItem>
                {Object.entries(NOMBRES_ORIGEN_EXTENDIDO).map(([valor, etiqueta]) => (
                  <SelectItem key={valor} value={valor}>{etiqueta}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Desde</Label>
            <Input type="date" className="w-40" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Hasta</Label>
            <Input type="date" className="w-40" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          {hayFiltros && (
            <Button variant="ghost" onClick={limpiar}><X className="size-4" /> Limpiar filtros</Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="max-h-[600px] tabla-scroll overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Cliente / Proveedor</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Egreso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Sin movimientos para los filtros seleccionados.</TableCell></TableRow>
                )}
                {filtrados.map(m => (
                  <TableRow key={m.id}>
                    <TableCell>{formatoFecha(m.fecha)}</TableCell>
                    <TableCell>{nombreCuenta.get(m.cuenta_id) || "-"}</TableCell>
                    <TableCell><Badge variant="secondary">{NOMBRES_ORIGEN_EXTENDIDO[m.origen] || m.origen}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate text-sm font-medium">{m.tercero || "-"}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">{m.concepto || "-"}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{m.tipo === "ingreso" ? formatoPesos(m.monto) : ""}</TableCell>
                    <TableCell className="text-right font-medium text-destructive">{m.tipo === "egreso" ? formatoPesos(m.monto) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-6 border-t pt-3 text-sm">
            <span>Ingresos: <span className="font-bold text-primary">{formatoPesos(totalIngresos)}</span></span>
            <span>Egresos: <span className="font-bold text-destructive">{formatoPesos(totalEgresos)}</span></span>
            <span>Neto: <span className={`font-bold ${totalIngresos - totalEgresos >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(totalIngresos - totalEgresos)}</span></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
