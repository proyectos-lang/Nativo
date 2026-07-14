import { requiereSesion } from "@/lib/sesion";
import {
  ventasConClienteSinMontos, detallesPorVentaSinMontos,
  historialPorVenta, listasMaestras,
} from "@/lib/consultas";
import { EntregasCliente } from "./entregas-cliente";
import type { Venta, VentaDetalle, HistorialEntrega } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaEntregas() {
  await requiereSesion();
  // Entregas nunca muestra montos (ni siquiera a admins): a logística no le compete el valor del pedido.
  const [ventas, detalles, historial, maestros] = await Promise.all([
    ventasConClienteSinMontos(), detallesPorVentaSinMontos(),
    historialPorVenta(), listasMaestras(),
  ]);
  return (
    <EntregasCliente
      ventas={ventas as unknown as Venta[]}
      detalles={detalles as Record<number, VentaDetalle[]>}
      historial={historial as Record<number, HistorialEntrega[]>}
      estados={maestros["estado_entrega"] || []}
      transportadoras={maestros["transportadora"] || []}
      talleres={maestros["taller"] || []}
    />
  );
}
