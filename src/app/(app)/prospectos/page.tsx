import { requiereSesion } from "@/lib/sesion";
import { prospectosTodos } from "@/lib/consultas";
import { ProspectosCliente } from "./prospectos-cliente";
import type { Prospecto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaProspectos() {
  await requiereSesion();
  const prospectos = await prospectosTodos();
  return <ProspectosCliente prospectos={prospectos as Prospecto[]} />;
}
