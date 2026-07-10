"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraficoFlujo } from "./grafico-flujo";
import { Landmark, TrendingUp, TrendingDown, Wallet, Scale } from "lucide-react";
import { formatoPesos, type CuentaBancaria, type MovimientoBancario, type Gasto, type Venta } from "@/lib/tipos";

type Props = {
  cuentas: CuentaBancaria[];
  movimientos: MovimientoBancario[];
  gastos: Gasto[];
  ventas: Venta[];
};

export function DashboardFinanciero({ cuentas, movimientos, gastos, ventas }: Props) {
  const totalBancos = useMemo(() => cuentas.reduce((s, c) => s + (c.saldo_actual || 0), 0), [cuentas]);
  const cxc = useMemo(() => ventas.reduce((s, v) => s + (v.saldo > 0 ? Number(v.saldo) : 0), 0), [ventas]);
  const cxp = useMemo(() => gastos.reduce((s, g) => s + (g.saldo > 0 ? Number(g.saldo) : 0), 0), [gastos]);
  const balance = totalBancos + cxc - cxp;

  // Flujo de caja: ingresos vs egresos por mes (últimos 12), excluyendo transferencias internas
  const serieFlujo = useMemo(() => {
    const hoy = new Date();
    const meses: { mes: string; ingresos: number; egresos: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      let ingresos = 0, egresos = 0;
      for (const m of movimientos) {
        if (m.origen === "transferencia") continue;
        if (!m.fecha.startsWith(clave)) continue;
        if (m.tipo === "ingreso") ingresos += Number(m.monto);
        else egresos += Number(m.monto);
      }
      meses.push({
        mes: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }),
        ingresos, egresos,
      });
    }
    return meses;
  }, [movimientos]);

  return (
    <div className="grid gap-4 pt-2">
      {/* KPIs principales */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total en Bancos</p>
              <Landmark className="size-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{formatoPesos(totalBancos)}</p>
            <p className="text-xs text-muted-foreground">{cuentas.filter(c => c.activa).length} cuenta(s) activa(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Cuentas por Cobrar</p>
              <TrendingUp className="size-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatoPesos(cxc)}</p>
            <p className="text-xs text-muted-foreground">{ventas.filter(v => v.saldo > 0).length} ventas con saldo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Cuentas por Pagar</p>
              <TrendingDown className="size-4 text-destructive" />
            </div>
            <p className="text-2xl font-bold text-destructive">{formatoPesos(cxp)}</p>
            <p className="text-xs text-muted-foreground">{gastos.filter(g => g.saldo > 0).length} gasto(s) pendiente(s)</p>
          </CardContent>
        </Card>
        <Card className="border-primary/40">
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Balance</p>
              <Scale className="size-4 text-primary" />
            </div>
            <p className={`text-2xl font-bold ${balance >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(balance)}</p>
            <p className="text-xs text-muted-foreground">Bancos + CxC − CxP</p>
          </CardContent>
        </Card>
      </div>

      {/* Saldo por cuenta (consolidación) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Consolidación bancaria</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay cuentas. Créalas en la pestaña Cuentas.</p>}
          {cuentas.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{c.nombre}</p>
                <p className="text-xs text-muted-foreground">{c.banco || "—"} {!c.activa && <Badge variant="destructive" className="ml-1">Inactiva</Badge>}</p>
              </div>
              <p className={`font-bold ${(c.saldo_actual || 0) >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatoPesos(c.saldo_actual)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Flujo de caja */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Flujo de caja real (últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <GraficoFlujo datos={serieFlujo} />
          <p className="mt-1 text-xs text-muted-foreground">Ingresos y egresos reales de las cuentas (las transferencias internas no cuentan).</p>
        </CardContent>
      </Card>
    </div>
  );
}
