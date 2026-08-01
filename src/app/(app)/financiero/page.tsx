import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  cuentasConSaldo, movimientosBancarios, gastosTodos, pagosGastosPorGasto,
  ventasConCliente, listasMaestras, pagosPorVenta, proveedoresTodos, gastosDetallePorGasto,
  ingresosTodos, pagosIngresosPorIngreso, auditoriaPorTabla, clientesActivos,
} from "@/lib/consultas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardFinanciero } from "./dashboard-fin";
import { CuentasCliente } from "./cuentas-cliente";
import { HistorialCliente } from "./historial-cliente";
import { GastosCliente } from "./gastos-cliente";
import { IngresosCliente } from "./ingresos-cliente";
import { IngresosVenta } from "./ingresos-venta";
import { CierreDiario } from "./cierre-diario";
import type {
  CuentaBancaria, MovimientoBancario, Gasto, GastoDetalle, PagoGasto, Venta, Pago,
  Proveedor, Ingreso, PagoIngreso, Bitacora, Cliente,
} from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaFinanciero() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.financiero) redirect("/");

  const [
    cuentas, movimientos, gastos, pagosGastos, ventas, maestros, pagosVentas,
    proveedores, gastosDetalle, ingresos, pagosIngresos, auditoriaGastos, auditoriaIngresos, clientes,
  ] = await Promise.all([
    cuentasConSaldo(), movimientosBancarios(), gastosTodos(), pagosGastosPorGasto(),
    ventasConCliente(), listasMaestras(), pagosPorVenta(),
    proveedoresTodos(), gastosDetallePorGasto(), ingresosTodos(), pagosIngresosPorIngreso(),
    auditoriaPorTabla("gastos"), auditoriaPorTabla("ingresos", ["editar", "actualizar_facturacion"]),
    clientesActivos(),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="mb-4 text-xl font-bold">Financiero</h2>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="cuentas">Cuentas</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="gastos">Gastos y Costos</TabsTrigger>
          <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
          <TabsTrigger value="ingresos-venta">Ingresos por Venta</TabsTrigger>
          <TabsTrigger value="cierre">Cierre Diario</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardFinanciero
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
            gastos={gastos as Gasto[]}
            ventas={ventas as Venta[]}
            ingresos={ingresos as Ingreso[]}
          />
        </TabsContent>
        <TabsContent value="cuentas">
          <CuentasCliente
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
            categoriasIngreso={maestros["categoria_ingreso"] || []}
            categoriasGasto={maestros["categoria_gasto"] || []}
          />
        </TabsContent>
        <TabsContent value="historial">
          <HistorialCliente
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
            proveedores={proveedores as Proveedor[]}
            gastosDetalle={gastosDetalle as Record<number, GastoDetalle[]>}
            auditoriaGastos={auditoriaGastos as Record<number, Bitacora[]>}
            unidadesMedida={maestros["unidad_medida"] || []}
          />
        </TabsContent>
        <TabsContent value="ingresos">
          <IngresosCliente
            ingresos={ingresos as Ingreso[]}
            pagosIngresos={pagosIngresos as Record<number, PagoIngreso[]>}
            cuentas={(cuentas as CuentaBancaria[]).filter(c => c.activa)}
            categorias={maestros["categoria_ingreso"] || []}
            auditoriaIngresos={auditoriaIngresos as Record<number, Bitacora[]>}
            clientes={clientes as Cliente[]}
          />
        </TabsContent>
        <TabsContent value="ingresos-venta">
          <IngresosVenta
            ventas={ventas as Venta[]}
            pagosVentas={pagosVentas as Record<number, Pago[]>}
            cuentas={cuentas as CuentaBancaria[]}
            ingresos={ingresos as Ingreso[]}
            movimientos={movimientos as MovimientoBancario[]}
          />
        </TabsContent>
        <TabsContent value="cierre">
          <CierreDiario
            cuentas={cuentas as CuentaBancaria[]}
            movimientos={movimientos as MovimientoBancario[]}
            gastos={gastos as Gasto[]}
            ventas={ventas as Venta[]}
            pagosVentas={pagosVentas as Record<number, Pago[]>}
            ingresos={ingresos as Ingreso[]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
