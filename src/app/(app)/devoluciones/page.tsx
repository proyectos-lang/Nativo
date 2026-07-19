import { requiereSesion } from "@/lib/sesion";
import {
  ventasConCliente, detallesPorVenta, devolucionesTodas, devolucionesDetallePorDevolucion,
  devolucionesHistorialPorDetalle, listasMaestras, cuentasConSaldo, ubicacionesInventario,
} from "@/lib/consultas";
import { DevolucionesCliente } from "./devoluciones-cliente";
import type { Venta, VentaDetalle, Devolucion, DevolucionDetalle, DevolucionHistorial, CuentaBancaria, InventarioUbicacion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaDevoluciones() {
  await requiereSesion();

  const [ventas, detallesVenta, devoluciones, detalles, historial, maestros, cuentas, ubicaciones] = await Promise.all([
    ventasConCliente(),
    detallesPorVenta(),
    devolucionesTodas(),
    devolucionesDetallePorDevolucion(),
    devolucionesHistorialPorDetalle(),
    listasMaestras(),
    cuentasConSaldo(),
    ubicacionesInventario(),
  ]);

  return (
    <DevolucionesCliente
      ventas={ventas as unknown as Venta[]}
      detallesVenta={detallesVenta as Record<number, VentaDetalle[]>}
      devoluciones={devoluciones as Devolucion[]}
      detalles={detalles as Record<number, DevolucionDetalle[]>}
      historial={historial as Record<number, DevolucionHistorial[]>}
      causales={maestros["causal_devolucion"] || []}
      cuentas={(cuentas as CuentaBancaria[]).filter(c => c.activa)}
      ubicaciones={(ubicaciones as InventarioUbicacion[]).filter(u => u.activa)}
    />
  );
}
