import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { bitacoraTodos } from "@/lib/consultas";
import { TrazabilidadCliente } from "./trazabilidad-cliente";
import type { Bitacora } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaTrazabilidad() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin") redirect("/");
  const eventos = await bitacoraTodos();
  return (
    <div className="mx-auto max-w-7xl">
      <h2 className="mb-4 text-xl font-bold">Trazabilidad de Transacciones</h2>
      <TrazabilidadCliente eventos={eventos as Bitacora[]} />
    </div>
  );
}
