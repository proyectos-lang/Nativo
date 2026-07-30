import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { productosCatalogo, recetasConMateriales, listasMaestras } from "@/lib/consultas";
import { CostosCliente } from "./costos-cliente";
import type { Producto, Receta, RecetaMaterial } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaCostos() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.costos) redirect("/");

  const [productos, recetas, maestros] = await Promise.all([
    productosCatalogo(),
    recetasConMateriales(),
    listasMaestras(),
  ]);

  return (
    <CostosCliente
      productos={productos as Producto[]}
      recetas={recetas as Record<number, { receta: Receta; lineas: RecetaMaterial[] }>}
      unidades={maestros["unidad_medida"] || []}
    />
  );
}
