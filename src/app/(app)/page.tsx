import Link from "next/link";
import { requierePermisoPagina } from "@/lib/sesion";
import { ventasConCliente, detallesPorVenta, historialPorVenta, prospectosTodos, cuentasConSaldo, devolucionesDetallePendientes } from "@/lib/consultas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraficoVentas } from "./grafico-ventas";
import { FiltroMes } from "./filtro-mes";
import { SplashBienvenida } from "@/components/splash-bienvenida";
import { AlertasCarousel } from "./alertas-carousel";
import { construirInsights } from "./insights";
import {
  DollarSign, Truck, AlertTriangle, TrendingUp, CheckCircle2, ArrowUpRight, ArrowDownRight, Contact, Landmark, RotateCcw,
} from "lucide-react";
import { formatoPesos, formatoFecha, type Venta, type VentaDetalle, type HistorialEntrega, type Prospecto, type CuentaBancaria } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const DIAS_ALERTA = 10;

export default async function PaginaDashboard({ searchParams }: { searchParams: Promise<{ mes?: string; anio?: string; bienvenida?: string }> }) {
  const sesion = await requierePermisoPagina("dashboard");
  const params = await searchParams;
  const mostrarBienvenida = params.bienvenida === "1";
  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);
  const limiteProximos = new Date(hoy);
  limiteProximos.setDate(limiteProximos.getDate() + 3);
  const limiteProximosStr = limiteProximos.toISOString().slice(0, 10);
  const mes = params.mes !== undefined ? Number(params.mes) - 1 : hoy.getMonth();
  const anio = params.anio !== undefined ? Number(params.anio) : hoy.getFullYear();

  const esFinanciero = sesion.rol === "admin" || sesion.permisos.financiero;

  const [ventas, detalles, historial, prospectos, cuentas, devolucionesPendientes] = await Promise.all([
    ventasConCliente() as Promise<Venta[]>,
    detallesPorVenta() as Promise<Record<number, VentaDetalle[]>>,
    historialPorVenta() as Promise<Record<number, HistorialEntrega[]>>,
    prospectosTodos() as Promise<Prospecto[]>,
    (esFinanciero ? cuentasConSaldo() : Promise.resolve([])) as Promise<CuentaBancaria[]>,
    devolucionesDetallePendientes(),
  ]);

  const cuentasActivas = cuentas.filter(c => c.activa);
  const totalBancos = cuentasActivas.reduce((s, c) => s + (c.saldo_actual || 0), 0);

  const prospectosPendientes = prospectos.filter(p => p.estado === "Pendiente");

  // ---- KPIs de estado actual (no dependen del mes seleccionado) ----
  const porCobrar = ventas.reduce((s, v) => s + (v.saldo > 0 ? v.saldo : 0), 0);
  const noEntregadas = ventas.filter(v => (v.estado_entrega || "").trim().toLowerCase() !== "entregado");
  const conAlerta = noEntregadas.filter(v => {
    const hist = historial[v.id] || [];
    const ultima = hist.length ? new Date(hist[hist.length - 1].fecha) : new Date((v.fecha_entrega || v.fecha) + "T00:00:00");
    return Math.floor((Date.now() - ultima.getTime()) / 86400000) >= DIAS_ALERTA;
  });

  // ---- KPIs del mes seleccionado ----
  const enMes = (f: string, m: number, a: number) => {
    const d = new Date(f + "T00:00:00");
    return d.getMonth() === m && d.getFullYear() === a;
  };
  const ventasMes = ventas.filter(v => enMes(v.fecha, mes, anio));
  const totalVentasMes = ventasMes.reduce((s, v) => s + v.total_compra, 0);
  const mesAnt = mes === 0 ? 11 : mes - 1;
  const anioAnt = mes === 0 ? anio - 1 : anio;
  const totalMesAnterior = ventas.filter(v => enMes(v.fecha, mesAnt, anioAnt)).reduce((s, v) => s + v.total_compra, 0);
  const variacion = totalMesAnterior > 0 ? ((totalVentasMes - totalMesAnterior) / totalMesAnterior) * 100 : null;

  const entregadosMes = new Set(
    Object.entries(historial).flatMap(([ventaId, hs]) =>
      hs.filter(h => h.estado_nuevo?.trim().toLowerCase() === "entregado" && enMes(h.fecha.slice(0, 10), mes, anio))
        .map(() => ventaId)
    )
  ).size;

  // ---- Gráfico: ventas por mes (últimos 12) ----
  const serieMeses: { mes: string; total: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anio, mes - i, 1);
    const total = ventas.filter(v => enMes(v.fecha, d.getMonth(), d.getFullYear())).reduce((s, v) => s + v.total_compra, 0);
    serieMeses.push({
      mes: d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" }),
      total,
    });
  }

  // ---- Tops del mes seleccionado ----
  const idsVentasMes = new Set(ventasMes.map(v => v.id));
  const porProducto = new Map<string, number>();
  for (const [ventaId, dets] of Object.entries(detalles)) {
    if (!idsVentasMes.has(Number(ventaId))) continue;
    for (const d of dets) porProducto.set(d.producto, (porProducto.get(d.producto) || 0) + d.valor_total);
  }
  const topProductos = [...porProducto.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const porCliente = new Map<string, number>();
  for (const v of ventasMes) {
    const nombre = v.clientes?.nombre || "Sin cliente";
    porCliente.set(nombre, (porCliente.get(nombre) || 0) + v.total_compra);
  }
  const topClientes = [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // ---- Alertas ordenadas por días ----
  const alertasDetalle = conAlerta.map(v => {
    const hist = historial[v.id] || [];
    const ultima = hist.length ? new Date(hist[hist.length - 1].fecha) : new Date((v.fecha_entrega || v.fecha) + "T00:00:00");
    return { v, dias: Math.floor((Date.now() - ultima.getTime()) / 86400000), ultima };
  }).sort((a, b) => b.dias - a.dias);

  const nombreMes = new Date(anio, mes, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });

  const insights = construirInsights({
    hoyStr, limiteProximosStr, ventas, noEntregadas, alertasDetalle, diasAlerta: DIAS_ALERTA,
    prospectos, variacion, totalVentasMes, cuentasActivas, esFinanciero, devolucionesPendientes,
  });

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      {mostrarBienvenida && <SplashBienvenida nombre={sesion.nombre} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Hola, {sesion.nombre.split(" ")[0]} 👋</h2>
          <p className="text-sm text-muted-foreground">Resumen del negocio — {nombreMes}</p>
        </div>
        <FiltroMes mes={mes} anio={anio} />
      </div>

      <AlertasCarousel insights={insights} />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Link href="/pagos">
          <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Por Cobrar</p>
                <DollarSign className="size-4 text-destructive" />
              </div>
              <p className="text-2xl font-bold text-destructive">{formatoPesos(porCobrar)}</p>
              <p className="text-xs text-muted-foreground">{ventas.filter(v => v.saldo > 0).length} pedidos con saldo</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/entregas">
          <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Pendientes Entrega</p>
                <Truck className="size-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{noEntregadas.length}</p>
              <p className="text-xs text-muted-foreground">pedidos sin entregar</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/seguimiento">
          <Card className={`h-full transition hover:-translate-y-0.5 hover:shadow-md ${conAlerta.length ? "border-destructive/50" : ""}`}>
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Con Alerta</p>
                <AlertTriangle className="size-4 text-destructive" />
              </div>
              <p className={`text-2xl font-bold ${conAlerta.length ? "text-destructive" : ""}`}>{conAlerta.length}</p>
              <p className="text-xs text-muted-foreground">{DIAS_ALERTA}+ días sin movimiento</p>
            </CardContent>
          </Card>
        </Link>
        <Card className="h-full">
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Ventas del Mes</p>
              <TrendingUp className="size-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">{formatoPesos(totalVentasMes)}</p>
            {variacion !== null ? (
              <p className={`flex items-center gap-1 text-xs ${variacion >= 0 ? "text-primary" : "text-destructive"}`}>
                {variacion >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                {Math.abs(variacion).toFixed(1)}% vs mes anterior
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{ventasMes.length} ventas registradas</p>
            )}
          </CardContent>
        </Card>
        <Card className="h-full">
          <CardContent className="pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase text-muted-foreground">Entregados</p>
              <CheckCircle2 className="size-4 text-primary" />
            </div>
            <p className="text-2xl font-bold">{entregadosMes}</p>
            <p className="text-xs text-muted-foreground">en el mes seleccionado</p>
          </CardContent>
        </Card>
        <Link href="/prospectos">
          <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Prospectos Pendientes</p>
                <Contact className="size-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{prospectosPendientes.length}</p>
              <p className="text-xs text-muted-foreground">por contactar</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/devoluciones">
          <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-muted-foreground">Devoluciones Activas</p>
                <RotateCcw className="size-4 text-primary" />
              </div>
              <p className="text-2xl font-bold">{devolucionesPendientes.length}</p>
              <p className="text-xs text-muted-foreground">pendientes o en reproceso</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Consolidado bancario */}
      {esFinanciero && (
        <Link href="/financiero">
          <Card className="transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base"><Landmark className="size-4" /> Consolidado Bancario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {cuentasActivas.length === 0 && <p className="text-sm text-muted-foreground">Sin cuentas bancarias activas.</p>}
                {cuentasActivas.map(c => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <p className="truncate text-xs font-medium uppercase text-muted-foreground">{c.nombre}</p>
                    <p className={`text-lg font-bold ${(c.saldo_actual || 0) >= 0 ? "" : "text-destructive"}`}>{formatoPesos(c.saldo_actual)}</p>
                    {c.banco && <p className="truncate text-xs text-muted-foreground">{c.banco}</p>}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium text-muted-foreground">Total en bancos</span>
                <span className={`text-xl font-bold ${totalBancos >= 0 ? "text-primary" : "text-destructive"}`}>{formatoPesos(totalBancos)}</span>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Gráfico + tops */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Ventas por mes (últimos 12)</CardTitle></CardHeader>
          <CardContent><GraficoVentas datos={serieMeses} /></CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top productos del mes</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {topProductos.length === 0 && <p className="text-sm text-muted-foreground">Sin ventas este mes.</p>}
              {topProductos.map(([nombre, total], i) => (
                <div key={nombre} className="flex items-center justify-between text-sm">
                  <span className="truncate"><span className="mr-1 text-muted-foreground">{i + 1}.</span>{nombre}</span>
                  <span className="font-semibold">{formatoPesos(total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top clientes del mes</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {topClientes.length === 0 && <p className="text-sm text-muted-foreground">Sin ventas este mes.</p>}
              {topClientes.map(([nombre, total], i) => (
                <div key={nombre} className="flex items-center justify-between text-sm">
                  <span className="truncate"><span className="mr-1 text-muted-foreground">{i + 1}.</span>{nombre}</span>
                  <span className="font-semibold">{formatoPesos(total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alertas */}
      {alertasDetalle.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="size-4" /> Pedidos con {DIAS_ALERTA}+ días sin movimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Último movimiento</TableHead>
                    <TableHead className="text-right">Días</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertasDetalle.map(({ v, dias, ultima }) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-semibold">#{v.ticket}</TableCell>
                      <TableCell>{v.clientes?.nombre || "-"}</TableCell>
                      <TableCell><Badge variant="outline">{v.estado_entrega || "Sin Estado"}</Badge></TableCell>
                      <TableCell>{formatoFecha(ultima.toISOString())}</TableCell>
                      <TableCell className="text-right font-bold text-destructive">{dias}</TableCell>
                      <TableCell className="text-right">{formatoPesos(v.saldo)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
