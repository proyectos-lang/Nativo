import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { activosTodos, proveedoresTodos, listasMaestras } from "@/lib/consultas";
import { ActivosCliente } from "./activos-cliente";
import type { Activo, Proveedor } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaActivos() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.activos) redirect("/");

  const [activos, proveedores, maestras] = await Promise.all([
    activosTodos(),
    proveedoresTodos(),
    listasMaestras(),
  ]);

  return (
    <ActivosCliente
      activos={activos as Activo[]}
      proveedores={proveedores as Proveedor[]}
      categorias={maestras.categoria_activo || []}
      ubicaciones={maestras.ubicacion_activo || []}
      motivosBaja={maestras.motivo_baja_activo || []}
    />
  );
}
