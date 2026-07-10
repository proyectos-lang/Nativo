"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Printer } from "lucide-react";
import {
  formatoPesos, formatoFecha,
  type CuentaBancaria, type MovimientoBancario, type Gasto, type Venta, type Pago,
} from "@/lib/tipos";

type Props = {
  cuentas: CuentaBancaria[];
  movimientos: MovimientoBancario[];
  gastos: Gasto[];
  ventas: Venta[];
  pagosVentas: Record<number, Pago[]>;
};

const HOY = () => new Date().toISOString().slice(0, 10);

export function CierreDiario({ cuentas, movimientos, gastos, ventas, pagosVentas }: Props) {
  const [fecha, setFecha] = useState(HOY());

  const datos = useMemo(() => {
    const ventasDia = ventas.filter(v => v.fecha === fecha);
    const totalVentasDia = ventasDia.reduce((s, v) => s + Number(v.total_compra), 0);

    const ventaPorId = new Map(ventas.map(v => [v.id, v]));
    const pagosDia = Object.values(pagosVentas).flat().filter(p => p.fecha === fecha);
    const totalPagosDia = pagosDia.reduce((s, p) => s + Number(p.abono), 0);

    const movsDia = movimientos.filter(m => m.fecha === fecha);
    const pagosGastosDia = movsDia.filter(m => m.origen === "pago_gasto");
    const totalPagosGastosDia = pagosGastosDia.reduce((s, m) => s + Number(m.monto), 0);
    const manualesDia = movsDia.filter(m => m.origen === "manual" || m.origen === "transferencia");

    const gastosCausadosDia = gastos.filter(g => g.fecha === fecha);
    const totalCausadoDia = gastosCausadosDia.reduce((s, g) => s + Number(g.monto), 0);

    // Balance de caja del día: movimientos reales excluyendo transferencias internas
    const entradasCaja = movsDia.filter(m => m.tipo === "ingreso" && m.origen !== "transferencia").reduce((s, m) => s + Number(m.monto), 0);
    const salidasCaja = movsDia.filter(m => m.tipo === "egreso" && m.origen !== "transferencia").reduce((s, m) => s + Number(m.monto), 0);

    // Consolidación al cierre de la fecha
    const consolidacion = cuentas.map(c => {
      const delta = movimientos
        .filter(m => m.cuenta_id === c.id && m.fecha <= fecha)
        .reduce((s, m) => s + (m.tipo === "ingreso" ? Number(m.monto) : -Number(m.monto)), 0);
      return { cuenta: c, saldoCierre: Number(c.saldo_inicial) + delta };
    });
    const totalCierre = consolidacion.reduce((s, x) => s + x.saldoCierre, 0);

    return {
      ventasDia, totalVentasDia, pagosDia, totalPagosDia, ventaPorId,
      pagosGastosDia, totalPagosGastosDia, manualesDia,
      gastosCausadosDia, totalCausadoDia,
      entradasCaja, salidasCaja, balanceDia: entradasCaja - salidasCaja,
      consolidacion, totalCierre,
    };
  }, [fecha, cuentas, movimientos, gastos, ventas, pagosVentas]);

  const nombreCuenta = (id: number | null) => cuentas.find(c => c.id === id)?.nombre || (id ? `#${id}` : "Sin cuenta");

  const exportarExcel = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const resumen = [
      { Concepto: "Fecha del cierre", Valor: fecha },
      { Concepto: "Ventas registradas en el día", Valor: datos.totalVentasDia },
      { Concepto: "Pagos recibidos (abonos)", Valor: datos.totalPagosDia },
      { Concepto: "Pagos de gastos/costos", Valor: datos.totalPagosGastosDia },
      { Concepto: "Gastos/costos causados", Valor: datos.totalCausadoDia },
      { Concepto: "Entradas de caja del día", Valor: datos.entradasCaja },
      { Concepto: "Salidas de caja del día", Valor: datos.salidasCaja },
      { Concepto: "Balance del día", Valor: datos.balanceDia },
      { Concepto: "Total bancos al cierre", Valor: datos.totalCierre },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos.ventasDia.map(v => ({
      Ticket: v.ticket, Cliente: v.clientes?.nombre || "", Total: Number(v.total_compra), "Estado Pago": v.estado_pago || "",
    }))), "Ventas del día");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos.pagosDia.map(p => ({
      Ticket: datos.ventaPorId.get(p.venta_id)?.ticket || "", Cliente: datos.ventaPorId.get(p.venta_id)?.clientes?.nombre || "",
      Abono: Number(p.abono), "Retención": Number(p.retencion), Cuenta: nombreCuenta(p.cuenta_id ?? null), Comentario: p.comentario || "",
    }))), "Pagos recibidos");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos.pagosGastosDia.map(m => ({
      Concepto: m.concepto || "", Monto: Number(m.monto), Cuenta: nombreCuenta(m.cuenta_id),
    }))), "Pagos de gastos");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos.consolidacion.map(x => ({
      Cuenta: x.cuenta.nombre, Banco: x.cuenta.banco || "", "Saldo al cierre": x.saldoCierre,
    }))), "Consolidación");

    XLSX.writeFile(wb, `Cierre_Diario_${fecha}.xlsx`);
  };

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="grid gap-1.5">
          <Label>Fecha del cierre</Label>
          <Input type="date" className="w-44" value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarExcel}><FileSpreadsheet className="size-4" /> Exportar Excel</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Button>
        </div>
      </div>

      <div id="reporte-cierre" className="grid gap-4">
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">NATIVO LATAM — Cierre Diario</h1>
          <p className="text-sm">Fecha: {formatoFecha(fecha)}</p>
        </div>

        {/* Resumen del día */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Ventas del día</p>
            <p className="text-2xl font-bold text-primary">{formatoPesos(datos.totalVentasDia)}</p>
            <p className="text-xs text-muted-foreground">{datos.ventasDia.length} venta(s)</p>
          </CardContent></Card>
          <Card><CardContent className="pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Pagos recibidos</p>
            <p className="text-2xl font-bold text-primary">{formatoPesos(datos.totalPagosDia)}</p>
            <p className="text-xs text-muted-foreground">{datos.pagosDia.length} pago(s)</p>
          </CardContent></Card>
          <Card><CardContent className="pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Pagos de gastos</p>
            <p className="text-2xl font-bold text-destructive">{formatoPesos(datos.totalPagosGastosDia)}</p>
            <p className="text-xs text-muted-foreground">{datos.pagosGastosDia.length} pago(s) · causado hoy: {formatoPesos(datos.totalCausadoDia)}</p>
          </CardContent></Card>
          <Card className="border-primary/40"><CardContent className="pt-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Balance del día</p>
            <p className={`text-2xl font-bold ${datos.balanceDia >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(datos.balanceDia)}</p>
            <p className="text-xs text-muted-foreground">Entradas {formatoPesos(datos.entradasCaja)} − Salidas {formatoPesos(datos.salidasCaja)}</p>
          </CardContent></Card>
        </div>

        {/* Detalles */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Ventas registradas</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {datos.ventasDia.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">Sin ventas este día.</TableCell></TableRow>}
                  {datos.ventasDia.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-semibold">#{v.ticket}</TableCell>
                      <TableCell>{v.clientes?.nombre || "-"}</TableCell>
                      <TableCell className="text-right">{formatoPesos(v.total_compra)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pagos recibidos</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Ticket</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Abono</TableHead></TableRow></TableHeader>
                <TableBody>
                  {datos.pagosDia.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">Sin pagos este día.</TableCell></TableRow>}
                  {datos.pagosDia.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">#{datos.ventaPorId.get(p.venta_id)?.ticket || "-"}</TableCell>
                      <TableCell>{nombreCuenta(p.cuenta_id ?? null)}</TableCell>
                      <TableCell className="text-right">{formatoPesos(p.abono)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pagos de gastos y costos</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                <TableBody>
                  {datos.pagosGastosDia.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">Sin pagos de gastos este día.</TableCell></TableRow>}
                  {datos.pagosGastosDia.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-56 truncate">{m.concepto || "-"}</TableCell>
                      <TableCell>{nombreCuenta(m.cuenta_id)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatoPesos(m.monto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Otros movimientos (manuales y transferencias)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Cuenta</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
                <TableBody>
                  {datos.manualesDia.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">Sin movimientos este día.</TableCell></TableRow>}
                  {datos.manualesDia.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-56 truncate">{m.concepto || (m.origen === "transferencia" ? "Transferencia" : "Movimiento manual")}</TableCell>
                      <TableCell>{nombreCuenta(m.cuenta_id)}</TableCell>
                      <TableCell className={`text-right ${m.tipo === "ingreso" ? "text-primary" : "text-destructive"}`}>
                        {m.tipo === "ingreso" ? "+" : "−"}{formatoPesos(m.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Consolidación bancaria al cierre */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Consolidación bancaria al cierre del {formatoFecha(fecha)}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Cuenta</TableHead><TableHead>Banco</TableHead><TableHead className="text-right">Saldo al cierre</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {datos.consolidacion.map(x => (
                  <TableRow key={x.cuenta.id}>
                    <TableCell className="font-medium">{x.cuenta.nombre}</TableCell>
                    <TableCell>{x.cuenta.banco || "-"}</TableCell>
                    <TableCell className={`text-right font-bold ${x.saldoCierre >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(x.saldoCierre)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={2} className="font-bold">TOTAL BANCOS</TableCell>
                  <TableCell className={`text-right text-lg font-bold ${datos.totalCierre >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(datos.totalCierre)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
