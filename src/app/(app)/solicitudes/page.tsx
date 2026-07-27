import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import {
  solicitudesTodas, solicitudesHistorialPorSolicitud, solicitudesAdjuntosPorSolicitud,
  usuariosActivos, listasMaestras,
} from "@/lib/consultas";
import { SolicitudesCliente } from "./solicitudes-cliente";
import type { Solicitud, SolicitudHistorial, SolicitudAdjunto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaSolicitudes() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.solicitudes) redirect("/");

  const [solicitudes, historial, adjuntos, usuarios, maestras] = await Promise.all([
    solicitudesTodas(),
    solicitudesHistorialPorSolicitud(),
    solicitudesAdjuntosPorSolicitud(),
    usuariosActivos(),
    listasMaestras(),
  ]);

  return (
    <SolicitudesCliente
      solicitudes={solicitudes as Solicitud[]}
      historial={historial as Record<number, SolicitudHistorial[]>}
      adjuntos={adjuntos as Record<number, SolicitudAdjunto[]>}
      usuarios={usuarios as { id: number; nombre: string }[]}
      areas={maestras.area_solicitud || []}
      sesion={{ id: sesion.id, nombre: sesion.nombre, rol: sesion.rol }}
    />
  );
}
