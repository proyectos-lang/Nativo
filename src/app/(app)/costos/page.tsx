import { requiereSesion } from "@/lib/sesion";
import { redirect } from "next/navigation";
import { productosCatalogo, recetasConMateriales, listasMaestras, insumosTodos, movimientosInsumos, proveedoresTodos } from "@/lib/consultas";
import { CostosCliente } from "./costos-cliente";
import type { Producto, Receta, RecetaMaterial, Insumo, MovimientoInsumo, Proveedor } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/**
 * Degrada una consulta en vez de tumbar la pantalla. Sirve sobre todo para la
 * ventana entre el despliegue del código y la ejecución de la migración: si las
 * tablas de insumos aún no existen, la pestaña sale vacía en vez de dejar el
 * módulo entero con el error genérico de Next.js.
 */
async function tolerante<T>(nombre: string, consulta: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await consulta();
  } catch (e) {
    console.error(`[costos] la consulta "${nombre}" falló; se usa un valor vacío:`, (e as Error).message);
    return respaldo;
  }
}

export default async function PaginaCostos() {
  const sesion = await requiereSesion();
  if (sesion.rol !== "admin" && !sesion.permisos?.costos) redirect("/");

  const [productos, recetas, maestros, insumos, movimientos, proveedores] = await Promise.all([
    tolerante("productosCatalogo", productosCatalogo, [] as unknown[]),
    tolerante("recetasConMateriales", recetasConMateriales, {} as Record<number, { receta: unknown; lineas: unknown[] }>),
    tolerante("listasMaestras", listasMaestras, {} as Record<string, string[]>),
    tolerante("insumosTodos", insumosTodos, [] as unknown[]),
    tolerante("movimientosInsumos", () => movimientosInsumos(), [] as unknown[]),
    tolerante("proveedoresTodos", proveedoresTodos, [] as unknown[]),
  ]);

  return (
    <CostosCliente
      productos={productos as Producto[]}
      recetas={recetas as Record<number, { receta: Receta; lineas: RecetaMaterial[] }>}
      insumos={insumos as Insumo[]}
      movimientos={movimientos as MovimientoInsumo[]}
      proveedores={proveedores as Proveedor[]}
      unidades={maestros["unidad_medida"] || []}
      categoriasInsumo={maestros["categoria_insumo"] || []}
    />
  );
}
