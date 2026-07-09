import { requiereSesion } from "@/lib/sesion";
import { ventasConCliente, detallesPorVenta, historialPorVenta, listasMaestras } from "@/lib/consultas";
import { EntregasCliente } from "./entregas-cliente";
import type { Venta, VentaDetalle, HistorialEntrega } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaEntregas() {
  await requiereSesion();
  const [ventas, detalles, historial, maestros] = await Promise.all([
    ventasConCliente(), detallesPorVenta(), historialPorVenta(), listasMaestras(),
  ]);
  return (
    <EntregasCliente
      ventas={ventas as Venta[]}
      detalles={detalles as Record<number, VentaDetalle[]>}
      historial={historial as Record<number, HistorialEntrega[]>}
      estados={maestros["estado_entrega"] || []}
    />
  );
}
