"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import { formatoPesos, costoVigente, type TipoLineaReceta } from "@/lib/tipos";

function revalidarCostos() {
  revalidatePath("/costos");
  revalidatePath("/ventas");
}

export type LineaReceta = {
  tipo?: TipoLineaReceta;
  material_producto_id?: number | null;
  material: string;
  cantidad: number;
  unidad_medida?: string;
  costo_unitario: number;
  notas?: string;
};

const TIPOS: TipoLineaReceta[] = ["Material", "Mano de obra", "Servicio", "Otro"];

/**
 * Crea o actualiza la receta de un producto. Las líneas se borran y reinsertan
 * completas (mismo criterio que actualizarVenta con ventas_detalle) y los
 * totales se recalculan siempre en el servidor.
 */
export async function guardarReceta(datos: {
  producto_id: number;
  notas?: string;
  lineas: LineaReceta[];
}) {
  const sesion = await requierePermiso("costos");
  if (!datos.producto_id) throw new Error("Selecciona el producto de la receta.");

  const lineas = (datos.lineas || []).filter(l => l.material?.trim());
  if (!lineas.length) throw new Error("Agrega al menos un material o concepto de costo.");
  for (const l of lineas) {
    if ((Number(l.cantidad) || 0) <= 0) throw new Error(`La cantidad de "${l.material}" debe ser mayor a cero.`);
    if ((Number(l.costo_unitario) || 0) < 0) throw new Error(`El costo de "${l.material}" no puede ser negativo.`);
  }

  const filas = lineas.map(l => {
    const cantidad = Number(l.cantidad) || 0;
    const costo = Number(l.costo_unitario) || 0;
    return {
      tipo: TIPOS.includes(l.tipo as TipoLineaReceta) ? l.tipo : "Material",
      material_producto_id: l.material_producto_id || null,
      material: l.material.trim(),
      cantidad,
      unidad_medida: l.unidad_medida?.trim() || null,
      costo_unitario: costo,
      costo_total: Math.round(cantidad * costo * 100) / 100,
      notas: l.notas?.trim() || null,
    };
  });
  const costoTotal = Math.round(filas.reduce((s, f) => s + f.costo_total, 0) * 100) / 100;

  const { data: anterior } = await db().from("recetas").select("*").eq("producto_id", datos.producto_id).maybeSingle();

  const { data: receta, error } = await db().from("recetas").upsert({
    producto_id: datos.producto_id,
    notas: datos.notas?.trim() || null,
    costo_total: costoTotal,
    usuario: sesion.usuario,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: "producto_id" }).select("id").single();
  if (error) throw new Error(error.message);

  const { error: errDel } = await db().from("recetas_materiales").delete().eq("receta_id", receta.id);
  if (errDel) throw new Error(errDel.message);
  const { error: errIns } = await db().from("recetas_materiales")
    .insert(filas.map(f => ({ ...f, receta_id: receta.id })));
  if (errIns) throw new Error(errIns.message);

  const { data: prod } = await db().from("productos").select("nombre").eq("id", datos.producto_id).single();
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "costos", accion: anterior ? "editar" : "crear",
    entidad_tipo: "recetas", entidad_id: receta.id,
    descripcion: `Receta de ${prod?.nombre ?? datos.producto_id} — costo ${formatoPesos(costoTotal)} (${filas.length} línea${filas.length === 1 ? "" : "s"})`,
    datos_anteriores: anterior ?? null,
    datos_nuevos: { producto_id: datos.producto_id, costo_total: costoTotal, lineas: filas },
  });

  revalidarCostos();
  return { costo_total: costoTotal };
}

export async function eliminarReceta(recetaId: number) {
  const sesion = await requierePermiso("costos");
  const { data: anterior } = await db().from("recetas").select("*, productos(nombre)").eq("id", recetaId).single();
  const { error } = await db().from("recetas").delete().eq("id", recetaId);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "costos", accion: "eliminar",
    entidad_tipo: "recetas", entidad_id: recetaId,
    descripcion: `Receta eliminada: ${(anterior as { productos?: { nombre?: string } } | null)?.productos?.nombre ?? recetaId}`,
    datos_anteriores: anterior ?? null,
  });
  revalidarCostos();
}

/**
 * Refresca el costo de todas las líneas que apuntan al catálogo con el costo
 * vigente de cada producto, y recalcula los totales de cada receta.
 */
export async function recalcularCostosDesdeInventario(): Promise<{ lineas: number; recetas: number }> {
  const sesion = await requierePermiso("costos");

  const [{ data: lineas, error: e1 }, { data: productos, error: e2 }] = await Promise.all([
    db().from("recetas_materiales").select("id, receta_id, material_producto_id, cantidad, costo_unitario"),
    db().from("productos").select("id, costo_promedio, precio_compra"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);

  const costoDe = new Map<number, number>();
  for (const p of productos || []) costoDe.set(p.id, costoVigente(p));

  let actualizadas = 0;
  const recetasTocadas = new Set<number>();

  for (const l of lineas || []) {
    if (!l.material_producto_id) continue;
    const nuevo = costoDe.get(l.material_producto_id);
    if (nuevo == null || nuevo === Number(l.costo_unitario)) continue;
    const cantidad = Number(l.cantidad) || 0;
    const { error } = await db().from("recetas_materiales").update({
      costo_unitario: nuevo,
      costo_total: Math.round(cantidad * nuevo * 100) / 100,
    }).eq("id", l.id);
    if (error) throw new Error(error.message);
    actualizadas++;
    recetasTocadas.add(l.receta_id);
  }

  // Recalcula el total de las recetas afectadas
  for (const recetaId of recetasTocadas) {
    const { data: ls } = await db().from("recetas_materiales").select("costo_total").eq("receta_id", recetaId);
    const total = Math.round((ls || []).reduce((s, x) => s + (Number(x.costo_total) || 0), 0) * 100) / 100;
    await db().from("recetas").update({ costo_total: total, actualizado_en: new Date().toISOString() }).eq("id", recetaId);
  }

  if (actualizadas > 0) {
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "costos", accion: "editar",
      entidad_tipo: "recetas", entidad_id: 0,
      descripcion: `Costos refrescados desde inventario: ${actualizadas} línea(s) en ${recetasTocadas.size} receta(s)`,
      datos_nuevos: { lineas: actualizadas, recetas: recetasTocadas.size },
    });
  }

  revalidarCostos();
  return { lineas: actualizadas, recetas: recetasTocadas.size };
}
