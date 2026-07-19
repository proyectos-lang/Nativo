"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import type { Producto } from "@/lib/tipos";

function revalidarInventario() {
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  revalidatePath("/");
}

export type DatosProducto = {
  id?: number;
  nombre: string;
  sku?: string;
  codigo_barras?: string;
  categoria?: string;
  subcategoria?: string;
  sexo?: string;
  talla?: string;
  color?: string;
  manga?: string;
  unidad_medida?: string;
  precio_compra?: number;
  precio_venta_antes_iva?: number;
  iva_porcentaje?: number;
  es_servicio?: boolean;
  controla_inventario?: boolean;
  estado?: "Activo" | "Descontinuado";
  fecha_vencimiento?: string;
  stock_minimo?: number;
  stock_maximo?: number | null;
};

export async function guardarProducto(datos: DatosProducto): Promise<Producto> {
  const sesion = await requierePermiso("inventario");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  if (datos.es_servicio && datos.controla_inventario) {
    throw new Error("Un servicio no puede controlar inventario.");
  }

  const sku = datos.sku?.trim() || null;
  if (sku) {
    let q = db().from("productos").select("id").eq("sku", sku);
    if (datos.id) q = q.neq("id", datos.id);
    const { data: dup } = await q.maybeSingle();
    if (dup) throw new Error(`Ya existe un producto con el SKU "${sku}".`);
  }

  const antesIva = Number(datos.precio_venta_antes_iva) || 0;
  const iva = Number(datos.iva_porcentaje) || 0;
  const fila = {
    nombre: datos.nombre.trim(),
    sku,
    codigo_barras: datos.codigo_barras?.trim() || null,
    categoria: datos.categoria?.trim() || null,
    subcategoria: datos.subcategoria?.trim() || null,
    sexo: datos.sexo?.trim() || null,
    talla: datos.talla?.trim() || null,
    color: datos.color?.trim() || null,
    manga: datos.manga?.trim() || null,
    unidad_medida: datos.unidad_medida?.trim() || "Unidad",
    precio_compra: Number(datos.precio_compra) || 0,
    precio_venta_antes_iva: antesIva,
    iva_porcentaje: iva,
    precio_venta: Math.round(antesIva * (1 + iva / 100) * 100) / 100,
    es_servicio: !!datos.es_servicio,
    controla_inventario: !!datos.controla_inventario && !datos.es_servicio,
    estado: datos.estado || "Activo",
    fecha_vencimiento: datos.fecha_vencimiento || null,
    stock_minimo: Number(datos.stock_minimo) || 0,
    stock_maximo: datos.stock_maximo != null && datos.stock_maximo !== 0 ? Number(datos.stock_maximo) : null,
  };

  if (datos.id) {
    const { data: anterior } = await db().from("productos").select("*").eq("id", datos.id).single();
    const { data, error } = await db().from("productos").update(fila).eq("id", datos.id).select().single();
    if (error) {
      if (error.message.includes("duplicate")) throw new Error("Ya existe un producto con ese nombre.");
      throw new Error(error.message);
    }
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "inventario", accion: "editar",
      entidad_tipo: "productos", entidad_id: datos.id,
      descripcion: `Producto: ${fila.nombre}${sku ? ` (${sku})` : ""}`,
      datos_anteriores: anterior ?? null, datos_nuevos: fila,
    });
    revalidarInventario();
    return data as Producto;
  }

  const { data, error } = await db().from("productos").insert(fila).select().single();
  if (error) {
    if (error.message.includes("duplicate")) throw new Error("Ya existe un producto con ese nombre.");
    throw new Error(error.message);
  }
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "crear",
    entidad_tipo: "productos", entidad_id: data.id,
    descripcion: `Producto creado: ${fila.nombre}${sku ? ` (${sku})` : ""}`,
    datos_nuevos: fila,
  });
  revalidarInventario();
  return data as Producto;
}

export async function cambiarEstadoProducto(id: number, estado: "Activo" | "Descontinuado") {
  const sesion = await requierePermiso("inventario");
  const { data: anterior } = await db().from("productos").select("nombre, estado").eq("id", id).single();
  const { error } = await db().from("productos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "editar",
    entidad_tipo: "productos", entidad_id: id,
    descripcion: `Producto ${estado === "Activo" ? "reactivado" : "descontinuado"}: ${anterior?.nombre ?? id}`,
    datos_anteriores: anterior ?? null, datos_nuevos: { estado },
  });
  revalidarInventario();
}
