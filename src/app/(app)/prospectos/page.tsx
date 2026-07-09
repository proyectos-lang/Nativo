import { requiereSesion } from "@/lib/sesion";
import { db } from "@/lib/db";
import { ProspectosCliente } from "./prospectos-cliente";
import type { Prospecto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaProspectos() {
  await requiereSesion();
  const { data, error } = await db().from("prospectos").select("*").order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return <ProspectosCliente prospectos={(data || []) as Prospecto[]} />;
}
