import { requiereSesion } from "@/lib/sesion";
import {
  ventasConCliente, ventasConClienteSinMontos, detallesPorVenta, detallesPorVentaSinMontos,
  historialPorVenta, listasMaestras,
} from "@/lib/consultas";
import { EntregasCliente } from "./entregas-cliente";
import type { Venta, VentaDetalle, HistorialEntrega } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaEntregas() {
  const sesion = await requiereSesion();
  const esAdmin = sesion.rol === "admin";
  const [ventas, detalles, historial, maestros] = await Promise.all([
    esAdmin ? ventasConCliente() : ventasConClienteSinMontos(),
    esAdmin ? detallesPorVenta() : detallesPorVentaSinMontos(),
    historialPorVenta(), listasMaestras(),
  ]);
  return (
    <EntregasCliente
      ventas={ventas as Venta[]}
      detalles={detalles as Record<number, VentaDetalle[]>}
      historial={historial as Record<number, HistorialEntrega[]>}
      estados={maestros["estado_entrega"] || []}
      transportadoras={maestros["transportadora"] || []}
      esAdmin={esAdmin}
    />
  );
}
