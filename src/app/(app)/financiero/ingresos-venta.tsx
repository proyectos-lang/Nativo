"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, AlertTriangle, Download } from "lucide-react";
import { formatoPesos, formatoFecha, type CuentaBancaria, type MovimientoBancario, type Venta, type Pago, type Ingreso } from "@/lib/tipos";

type Props = {
  ventas: Venta[];
  pagosVentas: Record<number, Pago[]>;
  cuentas: CuentaBancaria[];
  /** Para comparar contra lo que la contadora registró como categoría "Ventas". */
  ingresos: Ingreso[];
  /** Para detectar pagos que además dejaron asiento (dinero contado dos veces). */
  movimientos: MovimientoBancario[];
};

type Fila = {
  pago: Pago;
  venta: Venta | undefined;
  cliente: string;
  ticket: number | null;
  /** El pago dejó además un asiento en el banco: se estaría contando dos veces. */
  duplicado: boolean;
};

export function IngresosVenta({ ventas, pagosVentas, cuentas, ingresos, movimientos }: Props) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cuentaId, setCuentaId] = useState("todas");
  const [cliente, setCliente] = useState("");

  const ventaPorId = useMemo(() => {
    const m = new Map<number, Venta>();
    for (const v of ventas) m.set(v.id, v);
    return m;
  }, [ventas]);

  const nombreCuenta = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of cuentas) m.set(c.id, c.nombre);
    return m;
  }, [cuentas]);

  /** Pagos que sí generaron asiento bancario (herencia anterior a la migración 029). */
  const pagosConAsiento = useMemo(
    () => new Set(movimientos.filter(m => m.pago_id != null).map(m => m.pago_id as number)),
    [movimientos],
  );

  const todas = useMemo<Fila[]>(() => {
    const filas: Fila[] = [];
    for (const lista of Object.values(pagosVentas)) {
      for (const pago of lista) {
        const venta = ventaPorId.get(pago.venta_id);
        filas.push({
          pago,
          venta,
          cliente: venta?.clientes?.nombre || "-",
          ticket: venta?.ticket ?? null,
          duplicado: pagosConAsiento.has(pago.id),
        });
      }
    }
    return filas.sort((a, b) => b.pago.fecha.localeCompare(a.pago.fecha) || b.pago.id - a.pago.id);
  }, [pagosVentas, ventaPorId, pagosConAsiento]);

  const filtradas = useMemo(() => {
    const q = cliente.toLowerCase().trim();
    return todas.filter(f => {
      if (desde && f.pago.fecha < desde) return false;
      if (hasta && f.pago.fecha > hasta) return false;
      if (cuentaId === "sin" && f.pago.cuenta_id != null) return false;
      if (cuentaId !== "todas" && cuentaId !== "sin" && f.pago.cuenta_id !== Number(cuentaId)) return false;
      if (q && !f.cliente.toLowerCase().includes(q) && !String(f.ticket ?? "").includes(q)) return false;
      return true;
    });
  }, [todas, desde, hasta, cuentaId, cliente]);

  const totales = useMemo(() => {
    let abonos = 0, retenciones = 0, duplicados = 0;
    for (const f of filtradas) {
      abonos += Number(f.pago.abono) || 0;
      retenciones += Number(f.pago.retencion) || 0;
      if (f.duplicado) duplicados += Number(f.pago.abono) || 0;
    }
    return { abonos, retenciones, aplicado: abonos + retenciones, duplicados };
  }, [filtradas]);

  /**
   * El otro lado de la conciliación: lo que la contadora registró como ingreso
   * de categoría "Ventas" en el mismo rango de fechas. Si los dos totales
   * coinciden, el mes cuadra sin tener que revisar línea por línea.
   */
  const registradoPorContadora = useMemo(() => {
    return ingresos
      .filter(i => (i.categoria || "").toLowerCase() === "ventas")
      .filter(i => (!desde || i.fecha >= desde) && (!hasta || i.fecha <= hasta))
      .reduce((s, i) => s + (Number(i.cobrado) || 0), 0);
  }, [ingresos, desde, hasta]);

  const diferencia = totales.abonos - registradoPorContadora;
  const cuadra = Math.abs(diferencia) < 0.01;

  const limpiar = () => { setDesde(""); setHasta(""); setCuentaId("todas"); setCliente(""); };
  const hayFiltros = !!desde || !!hasta || cuentaId !== "todas" || !!cliente;

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const datos = filtradas.map(f => ({
      Fecha: f.pago.fecha,
      Ticket: f.ticket ?? "",
      Cliente: f.cliente,
      Abono: Number(f.pago.abono) || 0,
      Retefuente: Number(f.pago.retefuente) || 0,
      ReteIVA: Number(f.pago.reteiva) || 0,
      ReteICA: Number(f.pago.reteica) || 0,
      "Retención total": Number(f.pago.retencion) || 0,
      Cuenta: f.pago.cuenta_id ? nombreCuenta.get(f.pago.cuenta_id) || "" : "",
      Comentario: f.pago.comentario || "",
      Usuario: f.pago.usuario || "",
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ingresos por Venta");
    XLSX.writeFile(wb, `ingresos-por-venta-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent className="pt-2">
          <p className="text-sm text-muted-foreground">
            Todo el dinero recibido por ventas: los abonos y las facturas canceladas que registra el equipo
            comercial desde el módulo <strong>Pagos</strong>. No es el valor vendido, sino el <strong>valor recibido</strong>.
            Estos pagos <strong>no</strong> mueven el saldo de las cuentas — el libro de bancos lo lleva la contadora
            desde Ingresos y Gastos. Esta pantalla es de solo lectura.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-2">
          <div className="grid gap-1.5">
            <Label>Desde</Label>
            <Input type="date" className="w-40" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Hasta</Label>
            <Input type="date" className="w-40" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>Cuenta</Label>
            <Select value={cuentaId} onValueChange={v => v && setCuentaId(v)}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las cuentas</SelectItem>
                <SelectItem value="sin">Sin cuenta indicada</SelectItem>
                {cuentas.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Cliente o ticket</Label>
            <Input className="w-52" placeholder="Buscar..." value={cliente} onChange={e => setCliente(e.target.value)} />
          </div>
          {hayFiltros && <Button variant="ghost" onClick={limpiar}><X className="size-4" /> Limpiar filtros</Button>}
          <Button variant="outline" className="ml-auto" onClick={exportar}><Download className="size-4" /> Exportar</Button>
        </CardContent>
      </Card>

      {/* PANEL DE CONCILIACIÓN */}
      <Card className={cuadra ? "border-primary/40" : "border-destructive/40"}>
        <CardContent className="grid gap-3 pt-2">
          <p className="text-sm font-semibold">Conciliación del periodo</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs uppercase text-muted-foreground">Recibido por ventas</p>
              <p className="text-2xl font-bold text-primary">{formatoPesos(totales.abonos)}</p>
              <p className="text-xs text-muted-foreground">{filtradas.length} pago(s) del equipo comercial</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs uppercase text-muted-foreground">Registrado en Ingresos</p>
              <p className="text-2xl font-bold">{formatoPesos(registradoPorContadora)}</p>
              <p className="text-xs text-muted-foreground">Categoría &quot;Ventas&quot;, mismo rango de fechas</p>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs uppercase text-muted-foreground">Diferencia</p>
              <p className={`text-2xl font-bold ${cuadra ? "text-primary" : "text-destructive"}`}>{formatoPesos(diferencia)}</p>
              <p className="text-xs text-muted-foreground">{cuadra ? "Cuadra" : "Hay que revisar"}</p>
            </div>
          </div>
          {!cuadra && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
              {diferencia > 0
                ? "El equipo comercial registró más dinero del que la contadora ingresó en el banco: falta registrar ese ingreso, o hay pagos con fecha distinta a la del extracto."
                : "La contadora registró más ingresos por ventas de los que hay en pagos: puede faltar registrar el pago de alguna factura, o el ingreso corresponde a otra categoría."}
            </p>
          )}
          {totales.duplicados > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                Hay {formatoPesos(totales.duplicados)} en pagos que además dejaron movimiento en el banco (marcados
                abajo). Ese dinero está contado dos veces en el saldo de la cuenta: bórralo desde
                <strong> Historial</strong> si la contadora ya lo registró en Ingresos.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          <div className="tabla-scroll max-h-[520px] rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Abono</TableHead>
                  <TableHead className="text-right">Retefuente</TableHead>
                  <TableHead className="text-right">ReteIVA</TableHead>
                  <TableHead className="text-right">ReteICA</TableHead>
                  <TableHead className="text-right">Retención</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Comentario</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    Sin pagos de ventas para los filtros seleccionados.
                  </TableCell></TableRow>
                )}
                {filtradas.map(f => (
                  <TableRow key={f.pago.id} className={f.duplicado ? "bg-destructive/5" : ""}>
                    <TableCell>{formatoFecha(f.pago.fecha)}</TableCell>
                    <TableCell className="font-semibold">{f.ticket ? `#${f.ticket}` : "-"}</TableCell>
                    <TableCell className="max-w-48 truncate">{f.cliente}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{formatoPesos(f.pago.abono)}</TableCell>
                    <TableCell className="text-right text-sm">{Number(f.pago.retefuente) ? formatoPesos(f.pago.retefuente) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{Number(f.pago.reteiva) ? formatoPesos(f.pago.reteiva) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{Number(f.pago.reteica) ? formatoPesos(f.pago.reteica) : "-"}</TableCell>
                    <TableCell className="text-right text-sm">{Number(f.pago.retencion) ? formatoPesos(f.pago.retencion) : "-"}</TableCell>
                    <TableCell className="max-w-40 truncate text-sm">
                      {f.pago.cuenta_id ? nombreCuenta.get(f.pago.cuenta_id) || "-" : <span className="text-muted-foreground">Sin indicar</span>}
                      {f.duplicado && <Badge variant="destructive" className="ml-1 text-[10px]">en banco</Badge>}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-sm">{f.pago.comentario || "-"}</TableCell>
                    <TableCell className="text-sm">{f.pago.usuario || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-6 border-t pt-3 text-sm">
            <span>Total abonos: <span className="font-bold text-primary">{formatoPesos(totales.abonos)}</span></span>
            <span>Total retenciones: <span className="font-bold">{formatoPesos(totales.retenciones)}</span></span>
            <span>Total aplicado a facturas: <span className="font-bold">{formatoPesos(totales.aplicado)}</span></span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Las retenciones reducen el saldo de la factura pero <strong>no son dinero que entre al banco</strong>,
            por eso van en un total aparte. El que se compara con el extracto es el total de abonos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
