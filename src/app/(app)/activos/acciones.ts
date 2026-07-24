"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import type { Activo } from "@/lib/tipos";

function revalidarActivos() {
  revalidatePath("/activos");
  revalidatePath("/");
}

export type DatosActivo = {
  id?: number;
  codigo?: string;
  nombre: string;
  categoria?: string;
  descripcion?: string;
  cantidad?: number;
  costo_unitario?: number;
  proveedor_id?: number | null;
  proveedor?: string;
  numero_factura?: string;
  fecha_compra?: string;
  ubicacion?: string;
  fecha_ingreso?: string;
  area?: string;
  marca?: string;
  color?: string;
  dimensiones?: string;
  modelo?: string;
  numero_serie?: string;
  estado_actual?: string;
  garantia_vida_util?: string;
  fecha_valuacion?: string;
  valor_actual_depreciacion?: number | null;
  generarGasto?: boolean; // solo aplica al crear
};

/**
 * Crea el Gasto (+ detalle) en Financiero para la compra de un activo.
 * Lógica duplicada localmente (no se llama a crearGasto de financiero/acciones.ts)
 * porque esa función exige requierePermiso("financiero") — un usuario con
 * permiso "activos" pero sin "financiero" no podría registrar la compra.
 */
async function crearGastoActivo(usuario: string | null, a: {
  nombre: string; codigo: string | null; proveedor_id: number | null; proveedor: string | null;
  numero_factura: string | null; fecha_compra: string; cantidad: number; costo_unitario: number; valor_total: number;
}): Promise<number> {
  const { data: maxData, error: errMax } = await db().from("gastos").select("ticket").order("ticket", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const ticket = ((maxData?.[0]?.ticket as number) || 0) + 1;

  const { data: gasto, error } = await db().from("gastos").insert({
    ticket,
    fecha: a.fecha_compra,
    tipo: "Gasto",
    categoria: "Compra de Activo Fijo",
    proveedor_id: a.proveedor_id,
    proveedor: a.proveedor,
    numero_factura: a.numero_factura,
    monto: a.valor_total,
    abonado: 0,
    saldo: a.valor_total,
    estado: "Pendiente",
    usuario,
  }).select("id, ticket").single();
  if (error) throw new Error(error.message);

  const { error: errDet } = await db().from("gastos_detalle").insert({
    gasto_id: gasto.id,
    cantidad: a.cantidad,
    unidad_medida: "Unidad",
    articulo: `${a.codigo ? a.codigo + " — " : ""}${a.nombre}`,
    precio_unitario: a.costo_unitario,
    valor_total: a.valor_total,
  });
  if (errDet) {
    await db().from("gastos").delete().eq("id", gasto.id);
    throw new Error(errDet.message);
  }

  return gasto.id as number;
}

export async function guardarActivo(datos: DatosActivo): Promise<Activo> {
  const sesion = await requierePermiso("activos");
  const nombre = datos.nombre?.trim();
  if (!nombre) throw new Error("El nombre del activo es obligatorio.");
  const cantidad = Number(datos.cantidad) || 1;
  if (cantidad <= 0) throw new Error("La cantidad debe ser mayor a cero.");
  const costo_unitario = Number(datos.costo_unitario) || 0;
  if (costo_unitario < 0) throw new Error("El costo unitario no puede ser negativo.");
  const valor_total = cantidad * costo_unitario;

  const valorActual = datos.valor_actual_depreciacion != null && String(datos.valor_actual_depreciacion) !== ""
    ? Number(datos.valor_actual_depreciacion) : null;
  const fila = {
    codigo: datos.codigo?.trim() || null,
    nombre,
    categoria: datos.categoria?.trim() || null,
    descripcion: datos.descripcion?.trim() || null,
    cantidad,
    costo_unitario,
    valor_total,
    proveedor_id: datos.proveedor_id || null,
    proveedor: datos.proveedor?.trim() || null,
    numero_factura: datos.numero_factura?.trim() || null,
    fecha_compra: datos.fecha_compra || new Date().toISOString().slice(0, 10),
    ubicacion: datos.ubicacion?.trim() || null,
    fecha_ingreso: datos.fecha_ingreso || null,
    area: datos.area?.trim() || null,
    marca: datos.marca?.trim() || null,
    color: datos.color?.trim() || null,
    dimensiones: datos.dimensiones?.trim() || null,
    modelo: datos.modelo?.trim() || null,
    numero_serie: datos.numero_serie?.trim() || null,
    estado_actual: datos.estado_actual?.trim() || null,
    garantia_vida_util: datos.garantia_vida_util?.trim() || null,
    fecha_valuacion: datos.fecha_valuacion || null,
    valor_actual_depreciacion: valorActual != null && !isNaN(valorActual) ? valorActual : null,
  };

  if (datos.id) {
    const { data: anterior } = await db().from("activos").select("*").eq("id", datos.id).single();
    const { data: actualizado, error } = await db().from("activos")
      .update({ ...fila, actualizado_en: new Date().toISOString() })
      .eq("id", datos.id).select("*").single();
    if (error) throw new Error(error.message);
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "activos", accion: "editar",
      entidad_tipo: "activos", entidad_id: datos.id,
      descripcion: `Activo editado: ${nombre}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
    revalidarActivos();
    return actualizado as Activo;
  }

  const { data: nuevo, error } = await db().from("activos").insert({ ...fila, usuario: sesion.usuario }).select("*").single();
  if (error) throw new Error(error.message);

  let gastoId: number | null = null;
  if ((datos.generarGasto ?? true) && valor_total > 0) {
    try {
      gastoId = await crearGastoActivo(sesion.usuario, {
        nombre, codigo: fila.codigo, proveedor_id: fila.proveedor_id, proveedor: fila.proveedor,
        numero_factura: fila.numero_factura, fecha_compra: fila.fecha_compra, cantidad, costo_unitario, valor_total,
      });
    } catch (e) {
      await db().from("activos").delete().eq("id", nuevo.id);
      throw new Error(`No se pudo generar el gasto en Financiero: ${(e as Error).message}`);
    }
    const { error: errGasto } = await db().from("activos").update({ gasto_id: gastoId }).eq("id", nuevo.id);
    if (errGasto) throw new Error(errGasto.message);
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "activos", accion: "crear",
    entidad_tipo: "activos", entidad_id: nuevo.id,
    descripcion: descripcionTicket("Activo", nuevo.id, valor_total),
    datos_nuevos: { ...fila, gasto_id: gastoId },
  });

  revalidarActivos();
  if (gastoId) revalidatePath("/financiero");
  return { ...(nuevo as Activo), gasto_id: gastoId };
}

export async function darDeBajaActivo(id: number, datos: {
  motivo: string;
  fecha_baja?: string;
  valor_baja?: number;
  observaciones_baja?: string;
}): Promise<void> {
  const sesion = await requierePermiso("activos");
  const motivo = datos.motivo?.trim();
  if (!motivo) throw new Error("El motivo de la baja es obligatorio.");

  const { data: anterior, error: errGet } = await db().from("activos").select("id, nombre, estado").eq("id", id).single();
  if (errGet) throw new Error(errGet.message);
  if (anterior.estado !== "Activo") throw new Error("Este activo ya fue dado de baja. Reactívalo primero si quieres corregirlo.");

  const nuevoEstado = motivo === "Vendido" ? "Vendido" : "Dado de Baja";
  const cambios = {
    estado: nuevoEstado,
    fecha_baja: datos.fecha_baja || new Date().toISOString().slice(0, 10),
    motivo_baja: motivo,
    valor_baja: datos.valor_baja != null ? Number(datos.valor_baja) || 0 : null,
    observaciones_baja: datos.observaciones_baja?.trim() || null,
    actualizado_en: new Date().toISOString(),
  };

  const { error } = await db().from("activos").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "activos", accion: "cambiar_estado",
    entidad_tipo: "activos", entidad_id: id,
    descripcion: `Activo "${anterior.nombre}" — ${nuevoEstado.toLowerCase()} (${motivo})`,
    datos_anteriores: { estado: anterior.estado }, datos_nuevos: cambios,
  });
  revalidarActivos();
}

export async function reactivarActivo(id: number): Promise<void> {
  const sesion = await requierePermiso("activos");
  const { data: anterior, error: errGet } = await db().from("activos").select("id, nombre, estado").eq("id", id).single();
  if (errGet) throw new Error(errGet.message);
  if (anterior.estado === "Activo") throw new Error("Este activo ya está activo.");

  const cambios = {
    estado: "Activo" as const,
    fecha_baja: null,
    motivo_baja: null,
    valor_baja: null,
    observaciones_baja: null,
    actualizado_en: new Date().toISOString(),
  };

  const { error } = await db().from("activos").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "activos", accion: "cambiar_estado",
    entidad_tipo: "activos", entidad_id: id,
    descripcion: `Activo "${anterior.nombre}" reactivado`,
    datos_anteriores: { estado: anterior.estado }, datos_nuevos: cambios,
  });
  revalidarActivos();
}

export async function eliminarActivo(id: number): Promise<void> {
  const sesion = await requierePermiso("activos");
  const { data: anterior, error: errGet } = await db().from("activos").select("*").eq("id", id).single();
  if (errGet) throw new Error(errGet.message);
  if (anterior.gasto_id) {
    throw new Error("Este activo generó un Gasto en Financiero: no se puede eliminar. Usa \"Dar de baja\" en su lugar.");
  }

  const { error } = await db().from("activos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "activos", accion: "eliminar",
    entidad_tipo: "activos", entidad_id: id,
    descripcion: `Activo eliminado: ${anterior?.nombre ?? id}`,
    datos_anteriores: anterior ?? null,
  });
  revalidarActivos();
}
