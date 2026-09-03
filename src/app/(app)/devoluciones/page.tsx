import { requiereSesion } from "@/lib/sesion";
import {
  ventasConCliente, detallesPorVenta, devolucionesTodas, devolucionesDetallePorDevolucion,
  devolucionesHistorialPorDetalle, listasMaestras, cuentasConSaldo, ubicacionesInventario,
} from "@/lib/consultas";
import { DevolucionesCliente } from "./devoluciones-cliente";
import type { Venta, VentaDetalle, Devolucion, DevolucionDetalle, DevolucionHistorial, CuentaBancaria, InventarioUbicacion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Degrada una consulta en vez de tumbar la pantalla. La página se re-renderiza
 * como parte de la respuesta al marcar una devolución: si una consulta fallara
 * ahí, la operación queda hecha pero el usuario ve el error genérico de Next.js
 * sin la causa. Degradando, la pantalla responde y el motivo queda en los logs.
 */
async function tolerante<T>(nombre: string, consulta: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await consulta();
  } catch (e) {
    console.error(`[devoluciones] la consulta "${nombre}" falló; se usa un valor vacío:`, (e as Error).message);
    return respaldo;
  }
}

export default async function PaginaDevoluciones() {
  await requiereSesion();

  const [ventas, detallesVenta, devoluciones, detalles, historial, maestros, cuentas, ubicaciones] = await Promise.all([
    tolerante("ventasConCliente", ventasConCliente, [] as unknown[]),
    tolerante("detallesPorVenta", detallesPorVenta, {} as Record<number, unknown[]>),
    tolerante("devolucionesTodas", devolucionesTodas, [] as unknown[]),
    tolerante("devolucionesDetallePorDevolucion", devolucionesDetallePorDevolucion, {} as Record<number, unknown[]>),
    tolerante("devolucionesHistorialPorDetalle", devolucionesHistorialPorDetalle, {} as Record<number, unknown[]>),
    tolerante("listasMaestras", listasMaestras, {} as Record<string, string[]>),
    tolerante("cuentasConSaldo", cuentasConSaldo, [] as unknown[]),
    tolerante("ubicacionesInventario", ubicacionesInventario, [] as unknown[]),
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
