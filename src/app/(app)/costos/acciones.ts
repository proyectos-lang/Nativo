"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import { formatoPesos, costoVigente, costoVigenteInsumo, type TipoLineaReceta, type TipoMovimientoInsumo } from "@/lib/tipos";

function revalidarCostos() {
  revalidatePath("/costos");
  revalidatePath("/ventas");
}

export type LineaReceta = {
  tipo?: TipoLineaReceta;
  insumo_id?: number | null;
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
      insumo_id: l.insumo_id || null,
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
 * Refresca el costo de todas las líneas que apuntan a un insumo o a un producto
 * del catálogo con su costo vigente, y recalcula los totales de cada receta.
 * El insumo manda: si una línea apunta a los dos, se usa el costo del insumo.
 */
export async function recalcularCostosDesdeInventario(): Promise<{ lineas: number; recetas: number }> {
  const sesion = await requierePermiso("costos");

  const [{ data: lineas, error: e1 }, { data: productos, error: e2 }, { data: insumos, error: e3 }] = await Promise.all([
    db().from("recetas_materiales").select("id, receta_id, insumo_id, material_producto_id, cantidad, costo_unitario"),
    db().from("productos").select("id, costo_promedio, precio_compra"),
    db().from("insumos").select("id, costo_unitario, ultimo_costo"),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);

  const costoDe = new Map<number, number>();
  for (const p of productos || []) costoDe.set(p.id, costoVigente(p));
  const costoInsumo = new Map<number, number>();
  for (const i of insumos || []) costoInsumo.set(i.id, costoVigenteInsumo(i));

  let actualizadas = 0;
  const recetasTocadas = new Set<number>();

  for (const l of lineas || []) {
    const nuevo = l.insumo_id
      ? costoInsumo.get(l.insumo_id)
      : l.material_producto_id
        ? costoDe.get(l.material_producto_id)
        : undefined;
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
      descripcion: `Costos refrescados desde insumos e inventario: ${actualizadas} línea(s) en ${recetasTocadas.size} receta(s)`,
      datos_nuevos: { lineas: actualizadas, recetas: recetasTocadas.size },
    });
  }

  revalidarCostos();
  return { lineas: actualizadas, recetas: recetasTocadas.size };
}

// ------------------------------------------------------------
// INVENTARIO DE INSUMOS
// ------------------------------------------------------------

export type DatosInsumo = {
  id?: number;
  nombre: string;
  codigo?: string;
  categoria?: string;
  unidad_medida?: string;
  stock_minimo?: number;
  proveedor_id?: number | null;
  notas?: string;
  activo?: boolean;
  /**
   * Costo unitario inicial. Solo se aplica al CREAR y solo si el insumo nace
   * sin existencia: después el costo es el promedio ponderado que calcula
   * `mover_insumo`, y tocarlo a mano descuadraría la valorización.
   */
  costo_inicial?: number;
};

/**
 * Crea o edita la ficha de un insumo. La existencia y el costo promedio NO se
 * tocan aquí: solo se mueven vía el RPC `mover_insumo` (mismo criterio que
 * las existencias de productos, que solo cambian por los RPCs de inventario).
 */
export async function guardarInsumo(datos: DatosInsumo) {
  const sesion = await requierePermiso("costos");
  const nombre = datos.nombre?.trim();
  if (!nombre) throw new Error("El nombre del insumo es obligatorio.");
  if ((Number(datos.stock_minimo) || 0) < 0) throw new Error("El stock mínimo no puede ser negativo.");

  const fila = {
    nombre,
    codigo: datos.codigo?.trim() || null,
    categoria: datos.categoria?.trim() || null,
    unidad_medida: datos.unidad_medida?.trim() || "Unidad",
    stock_minimo: Number(datos.stock_minimo) || 0,
    proveedor_id: datos.proveedor_id || null,
    notas: datos.notas?.trim() || null,
    activo: datos.activo !== false,
    actualizado_en: new Date().toISOString(),
  };

  if (datos.id) {
    const { data: anterior } = await db().from("insumos").select("*").eq("id", datos.id).single();
    const { error } = await db().from("insumos").update(fila).eq("id", datos.id);
    if (error) throw new Error(traducirErrorInsumo(error.message, nombre));
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "costos", accion: "editar",
      entidad_tipo: "insumos", entidad_id: datos.id,
      descripcion: `Insumo editado: ${nombre}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
    revalidarCostos();
    return { id: datos.id };
  }

  const costo = Number(datos.costo_inicial) || 0;
  const { data, error } = await db().from("insumos")
    .insert({ ...fila, costo_unitario: costo, ultimo_costo: costo })
    .select("id").single();
  if (error) throw new Error(traducirErrorInsumo(error.message, nombre));

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "costos", accion: "crear",
    entidad_tipo: "insumos", entidad_id: data.id,
    descripcion: `Insumo creado: ${nombre}${costo > 0 ? ` — costo ${formatoPesos(costo)}` : ""}`,
    datos_nuevos: { ...fila, costo_unitario: costo },
  });
  revalidarCostos();
  return { id: data.id as number };
}

/** Mensajes de Postgres traducidos a algo que el usuario pueda accionar. */
function traducirErrorInsumo(mensaje: string, nombre: string): string {
  if (mensaje.includes("insumos_nombre_key")) return `Ya existe un insumo llamado "${nombre}".`;
  if (mensaje.includes("idx_insumos_codigo")) return "Ya existe otro insumo con ese código.";
  return mensaje;
}

/**
 * Elimina un insumo. Los movimientos históricos se conservan (FK blanda) y las
 * líneas de receta que lo usaban conservan el nombre y el costo en texto.
 */
export async function eliminarInsumo(id: number) {
  const sesion = await requierePermiso("costos");
  const { data: anterior } = await db().from("insumos").select("*").eq("id", id).single();
  if (!anterior) throw new Error("El insumo ya no existe.");
  if (Number(anterior.existencia) > 0) {
    throw new Error(`"${anterior.nombre}" todavía tiene ${anterior.existencia} ${anterior.unidad_medida} en existencia. Sácalo del inventario o desactívalo en vez de eliminarlo.`);
  }

  const { error } = await db().from("insumos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "costos", accion: "eliminar",
    entidad_tipo: "insumos", entidad_id: id,
    descripcion: `Insumo eliminado: ${anterior.nombre}`,
    datos_anteriores: anterior,
  });
  revalidarCostos();
}

const TIPOS_MOV: TipoMovimientoInsumo[] = ["entrada", "salida", "ajuste"];

/**
 * Entrada, salida o ajuste de un insumo. Todo el trabajo (existencia + costo
 * promedio + asiento del movimiento) lo hace el RPC en una sola transacción.
 * En `ajuste`, `cantidad` es la existencia FÍSICA contada, no la diferencia.
 */
export async function movimientoInsumo(datos: {
  insumo_id: number;
  tipo: TipoMovimientoInsumo;
  cantidad: number;
  costo_unitario?: number | null;
  fecha?: string;
  proveedor_id?: number | null;
  numero_factura?: string;
  referencia?: string;
  motivo?: string;
}) {
  const sesion = await requierePermiso("costos");
  if (!datos.insumo_id) throw new Error("Selecciona el insumo.");
  if (!TIPOS_MOV.includes(datos.tipo)) throw new Error("Tipo de movimiento inválido.");

  const cantidad = Number(datos.cantidad);
  if (!Number.isFinite(cantidad)) throw new Error("La cantidad no es válida.");
  if (datos.tipo !== "ajuste" && cantidad <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  if (datos.tipo === "ajuste" && cantidad < 0) throw new Error("La existencia física no puede ser negativa.");
  if (datos.tipo === "salida" && !datos.motivo?.trim()) throw new Error("Indica el motivo de la salida.");
  if (datos.tipo === "ajuste" && !datos.motivo?.trim()) throw new Error("Indica el motivo del ajuste.");

  if (Number(datos.costo_unitario) < 0) throw new Error("El costo no puede ser negativo.");
  // Un costo vacío o en cero significa "sin costo explícito": la entrada usa el
  // promedio actual sin alterarlo. Mandar 0 hundiría el promedio ponderado.
  const costoNum = Number(datos.costo_unitario);
  const costo = Number.isFinite(costoNum) && costoNum > 0 ? costoNum : null;

  const { data, error } = await db().rpc("mover_insumo", {
    p_insumo_id: datos.insumo_id,
    p_tipo: datos.tipo,
    p_cantidad: cantidad,
    p_costo_unitario: datos.tipo === "entrada" ? costo : null,
    p_fecha: datos.fecha ? new Date(datos.fecha + "T12:00:00").toISOString() : new Date().toISOString(),
    p_proveedor_id: datos.proveedor_id || null,
    p_numero_factura: datos.numero_factura?.trim() || null,
    p_referencia: datos.referencia?.trim() || null,
    p_motivo: datos.motivo?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);

  const insumo = (Array.isArray(data) ? data[0] : data) as { nombre?: string; existencia?: number; unidad_medida?: string; costo_unitario?: number } | null;
  const etiqueta = datos.tipo === "entrada" ? "Entrada" : datos.tipo === "salida" ? "Salida" : "Ajuste";
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "costos", accion: "crear",
    entidad_tipo: "insumos_movimientos", entidad_id: datos.insumo_id,
    descripcion: `${etiqueta} de insumo ${insumo?.nombre ?? datos.insumo_id}: ${cantidad} ${insumo?.unidad_medida ?? ""} — saldo ${insumo?.existencia ?? "?"}`,
    datos_nuevos: { ...datos, costo_unitario: costo },
  });

  revalidarCostos();
  return {
    existencia: Number(insumo?.existencia) || 0,
    costo_unitario: Number(insumo?.costo_unitario) || 0,
    nombre: insumo?.nombre ?? "",
    unidad_medida: insumo?.unidad_medida ?? "",
  };
}

/**
 * Aplica a las recetas el costo promedio actual de UN insumo. Se llama después
 * de una entrada para que el nuevo costo se refleje sin tener que refrescar todo.
 */
export async function propagarCostoInsumo(insumoId: number): Promise<{ lineas: number; recetas: number }> {
  await requierePermiso("costos");
  const { data: insumo } = await db().from("insumos").select("costo_unitario, ultimo_costo").eq("id", insumoId).single();
  if (!insumo) return { lineas: 0, recetas: 0 };
  const nuevo = costoVigenteInsumo(insumo);

  const { data: lineas, error } = await db().from("recetas_materiales")
    .select("id, receta_id, cantidad, costo_unitario").eq("insumo_id", insumoId);
  if (error) throw new Error(error.message);

  const recetasTocadas = new Set<number>();
  let actualizadas = 0;
  for (const l of lineas || []) {
    if (Number(l.costo_unitario) === nuevo) continue;
    const cantidad = Number(l.cantidad) || 0;
    const { error: e } = await db().from("recetas_materiales").update({
      costo_unitario: nuevo,
      costo_total: Math.round(cantidad * nuevo * 100) / 100,
    }).eq("id", l.id);
    if (e) throw new Error(e.message);
    actualizadas++;
    recetasTocadas.add(l.receta_id);
  }

  for (const recetaId of recetasTocadas) {
    const { data: ls } = await db().from("recetas_materiales").select("costo_total").eq("receta_id", recetaId);
    const total = Math.round((ls || []).reduce((s, x) => s + (Number(x.costo_total) || 0), 0) * 100) / 100;
    await db().from("recetas").update({ costo_total: total, actualizado_en: new Date().toISOString() }).eq("id", recetaId);
  }

  revalidarCostos();
  return { lineas: actualizadas, recetas: recetasTocadas.size };
}

/** Crea un proveedor sobre la marcha desde el diálogo de entrada de insumos. */
export async function crearProveedorInsumo(datos: { nombre: string; tipo?: string; nit?: string; contacto?: string }) {
  const sesion = await requierePermiso("costos");
  const nombre = datos.nombre?.trim();
  if (!nombre) throw new Error("El nombre del proveedor es obligatorio.");
  const fila = {
    nombre,
    tipo: datos.tipo?.trim() || null,
    nit: datos.nit?.trim() || null,
    contacto: datos.contacto?.trim() || null,
  };
  const { data, error } = await db().from("proveedores").insert(fila).select("id, nombre").single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "proveedores", accion: "crear",
    entidad_tipo: "proveedores", entidad_id: data.id,
    descripcion: `Proveedor creado desde insumos: ${nombre}`,
    datos_nuevos: fila,
  });
  revalidarCostos();
  return { id: data.id as number, nombre: data.nombre as string };
}
