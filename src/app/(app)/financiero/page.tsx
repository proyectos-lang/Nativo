import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  cuentasConSaldo, movimientosBancarios, gastosTodos, pagosGastosPorGasto,
  ventasConCliente, listasMaestras, pagosPorVenta,
} from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardFinanciero } from "./dashboard-fin";
import { CuentasCliente } from "./cuentas-cliente";
import { GastosCliente } from "./gastos-cliente";
import { CierreDiario } from "./cierre-diario";
import type { CuentaBancaria, MovimientoBancario, Gasto, PagoGasto, Venta, Pago } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaFinanciero() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.financiero) redirect("/");

  const [cuentas, movimientos, gastos, pagosGastos, ventas, maestros, pagosVentas] = await Promise.all([
    cuentasConSaldo(), movimientosBancarios(), gastosTodos(), pagosGastosPorGasto(),
    ventasConCliente(), listasMaestras(), pagosPorVenta(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="mb-4 text-xl font-bold">Financiero</h2>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
          <TabsTrigger value="gastos">Gastos y Costos</TabsTrigger>
          <TabsTrigger value="cierre">Cierre Diario</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardFinanciero
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
            gastos={gastos as Gasto[]}
            ventas={ventas as Venta[]}
          />
        </TabsContent>
        <TabsContent value="cuentas">
          <CuentasCliente
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
          />
        </TabsContent>
        <TabsContent value="gastos">
          <GastosCliente
            gastos={gastos as Gasto[]}
            pagosGastos={pagosGastos as Record<number, PagoGasto[]>}
            cuentas={(cuentas as CuentaBancaria[]).filter(c => c.activa)}
            categorias={maestros["categoria_gasto"] || []}
          />
        </TabsContent>
        <TabsContent value="cierre">
          <CierreDiario
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
            gastos={gastos as Gasto[]}
            ventas={ventas as Venta[]}
            pagosVentas={pagosVentas as Record<number, Pago[]>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
