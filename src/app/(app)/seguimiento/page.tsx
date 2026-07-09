import { requiereSesion } from "@/lib/sesion";
import { ventasConCliente, pagosPorVenta, historialPorVenta, detallesPorVenta } from "@/lib/consultas";
import { SeguimientoCliente } from "./seguimiento-cliente";
import type { Venta, Pago, HistorialEntrega, VentaDetalle } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaSeguimiento() {
  await requiereSesion();
  const [ventas, pagos, historial, detalles] = await Promise.all([
    ventasConCliente(), pagosPorVenta(), historialPorVenta(), detallesPorVenta(),
  ]);
  return (
    <SeguimientoCliente
      ventas={ventas as Venta[]}
      pagos={pagos as Record<number, Pago[]>}
      historial={historial as Record<number, HistorialEntrega[]>}
      detalles={detalles as Record<number, VentaDetalle[]>}
    />
  );
}
