import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { proveedoresTodos, listasMaestras } from "@/lib/consultas";
import { ProveedoresCliente } from "./proveedores-cliente";
import type { Proveedor } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaProveedores() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.proveedores) redirect("/");
  const [proveedores, maestras] = await Promise.all([proveedoresTodos(), listasMaestras()]);
  return <ProveedoresCliente proveedores={proveedores as Proveedor[]} tipos={maestras.tipo_proveedor || []} />;
}
