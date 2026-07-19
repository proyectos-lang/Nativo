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

// ------------------------------------------------------------
// OPERACIONES (Fase 2): ingreso, traslado, ajuste, salida manual
// ------------------------------------------------------------

export async function ingresarMercancia(datos: {
  producto_id: number;
  ubicacion_id: number;
  cantidad: number;
  costo_unitario: number;
  fecha?: string;
  proveedor_id?: number;
  numero_factura?: string;
  lote?: string;
  observaciones?: string;
}) {
  const sesion = await requierePermiso("inventario");
  const { data, error } = await db().rpc("ingresar_inventario", {
    p_producto_id: datos.producto_id,
    p_ubicacion_id: datos.ubicacion_id,
    p_cantidad: Number(datos.cantidad),
    p_costo_unitario: Number(datos.costo_unitario) || 0,
    p_tipo: "entrada",
    p_referencia: datos.numero_factura ? `Factura ${datos.numero_factura}` : "Ingreso de mercancía",
    p_proveedor_id: datos.proveedor_id || null,
    p_numero_factura: datos.numero_factura?.trim() || null,
    p_lote: datos.lote?.trim() || null,
    p_motivo: datos.observaciones?.trim() || null,
    p_usuario: sesion.usuario,
    p_fecha: datos.fecha ? new Date(datos.fecha + "T12:00:00").toISOString() : new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "crear",
    entidad_tipo: "inventario_movimientos", entidad_id: datos.producto_id,
    descripcion: `Ingreso de mercancía: ${data?.nombre ?? datos.producto_id} (+${datos.cantidad})`,
    datos_nuevos: datos,
  });
  revalidarInventario();
}

export async function trasladarStock(datos: {
  producto_id: number;
  origen_id: number;
  destino_id: number;
  cantidad: number;
  motivo: string;
}) {
  const sesion = await requierePermiso("inventario");
  const { error } = await db().rpc("trasladar_inventario", {
    p_producto_id: datos.producto_id,
    p_origen_id: datos.origen_id,
    p_destino_id: datos.destino_id,
    p_cantidad: Number(datos.cantidad),
    p_motivo: datos.motivo?.trim() || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "editar",
    entidad_tipo: "inventario_movimientos", entidad_id: datos.producto_id,
    descripcion: `Traslado de inventario: producto ${datos.producto_id} (${datos.cantidad})`,
    datos_nuevos: datos,
  });
  revalidarInventario();
}

export async function ajustarStock(datos: {
  producto_id: number;
  ubicacion_id: number;
  cantidad_fisica: number;
  motivo: string;
  observacion?: string;
}) {
  const sesion = await requierePermiso("inventario");
  if (!datos.motivo?.trim()) throw new Error("El motivo del ajuste es obligatorio.");
  const { data, error } = await db().rpc("ajustar_inventario", {
    p_producto_id: datos.producto_id,
    p_ubicacion_id: datos.ubicacion_id,
    p_cantidad_fisica: Number(datos.cantidad_fisica),
    p_motivo: [datos.motivo.trim(), datos.observacion?.trim()].filter(Boolean).join(" — "),
    p_usuario: sesion.usuario,
    p_referencia: "Ajuste manual",
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "editar",
    entidad_tipo: "inventario_movimientos", entidad_id: datos.producto_id,
    descripcion: `Ajuste de inventario: producto ${datos.producto_id} (diferencia ${data})`,
    datos_nuevos: { ...datos, diferencia: data },
  });
  revalidarInventario();
  return { diferencia: Number(data) };
}

export async function salidaManual(datos: {
  producto_id: number;
  ubicacion_id: number;
  cantidad: number;
  motivo: string;
}) {
  const sesion = await requierePermiso("inventario");
  if (!datos.motivo?.trim()) throw new Error("El motivo de la salida es obligatorio.");
  const { error } = await db().rpc("salida_manual_inventario", {
    p_producto_id: datos.producto_id,
    p_ubicacion_id: datos.ubicacion_id,
    p_cantidad: Number(datos.cantidad),
    p_motivo: datos.motivo.trim(),
    p_usuario: sesion.usuario,
    p_referencia: "Salida manual",
  });
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "editar",
    entidad_tipo: "inventario_movimientos", entidad_id: datos.producto_id,
    descripcion: `Salida manual de inventario: producto ${datos.producto_id} (−${datos.cantidad})`,
    datos_nuevos: datos,
  });
  revalidarInventario();
}

// ------------------------------------------------------------
// IMPORTACIÓN MASIVA (carga inicial desde Excel)
// ------------------------------------------------------------

export type FilaImportacion = {
  fila: number;
  sku?: string;
  codigo_barras?: string;
  nombre: string;
  categoria?: string;
  subcategoria?: string;
  sexo?: string;
  talla?: string;
  color?: string;
  manga?: string;
  unidad_medida?: string;
  es_servicio?: boolean;
  precio_compra?: number;
  precio_venta_antes_iva?: number;
  iva_porcentaje?: number;
  stock_minimo?: number;
  stock_maximo?: number;
  fecha_vencimiento?: string;
  cantidad_bodega?: number;
  cantidad_exhibicion?: number;
  costo_unitario?: number;
  proveedor?: string;
  numero_factura?: string;
  observaciones?: string;
};

export async function importarInventarioInicial(filas: FilaImportacion[]): Promise<{
  creados: number;
  actualizados: number;
  ingresados: number;
  errores: { fila: number; mensaje: string }[];
}> {
  const sesion = await requierePermiso("inventario");
  if (!filas?.length) throw new Error("No hay filas para importar.");
  if (filas.length > 2000) throw new Error("Máximo 2000 filas por importación. Divide el archivo.");

  const { data: ubicaciones, error: errUb } = await db().from("inventario_ubicaciones").select("id, nombre");
  if (errUb) throw new Error(errUb.message);
  const idBodega = ubicaciones?.find(u => u.nombre === "Bodega")?.id;
  const idExhibicion = ubicaciones?.find(u => u.nombre === "Exhibición")?.id;

  const { data: proveedores } = await db().from("proveedores").select("id, nombre, nit");

  let creados = 0, actualizados = 0, ingresados = 0;
  const errores: { fila: number; mensaje: string }[] = [];

  for (const f of filas) {
    try {
      const nombre = f.nombre?.trim();
      if (!nombre) throw new Error("El nombre es obligatorio.");
      const sku = f.sku?.trim() || null;
      const esServicio = !!f.es_servicio;
      const cantBodega = Number(f.cantidad_bodega) || 0;
      const cantExhibicion = Number(f.cantidad_exhibicion) || 0;
      if (esServicio && (cantBodega > 0 || cantExhibicion > 0)) {
        throw new Error("Un servicio no puede tener cantidades de inventario.");
      }
      if (cantBodega < 0 || cantExhibicion < 0) throw new Error("Las cantidades no pueden ser negativas.");

      const antesIva = Number(f.precio_venta_antes_iva) || 0;
      const iva = Number(f.iva_porcentaje) || 0;
      const filaProducto = {
        nombre,
        sku,
        codigo_barras: f.codigo_barras?.trim() || null,
        categoria: f.categoria?.trim() || null,
        subcategoria: f.subcategoria?.trim() || null,
        sexo: f.sexo?.trim() || null,
        talla: f.talla != null ? String(f.talla).trim() || null : null,
        color: f.color?.trim() || null,
        manga: f.manga?.trim() || null,
        unidad_medida: f.unidad_medida?.trim() || "Unidad",
        precio_compra: Number(f.precio_compra) || 0,
        precio_venta_antes_iva: antesIva,
        iva_porcentaje: iva,
        precio_venta: Math.round(antesIva * (1 + iva / 100) * 100) / 100,
        es_servicio: esServicio,
        controla_inventario: !esServicio,
        estado: "Activo",
        fecha_vencimiento: f.fecha_vencimiento?.trim() || null,
        stock_minimo: Number(f.stock_minimo) || 0,
        stock_maximo: Number(f.stock_maximo) > 0 ? Number(f.stock_maximo) : null,
      };

      // Busca el producto existente por SKU (prioridad) o por nombre
      let existente: { id: number } | null = null;
      if (sku) {
        const { data } = await db().from("productos").select("id").eq("sku", sku).maybeSingle();
        existente = data;
      }
      if (!existente) {
        const { data } = await db().from("productos").select("id").eq("nombre", nombre).maybeSingle();
        existente = data;
      }

      let productoId: number;
      if (existente) {
        const { error } = await db().from("productos").update(filaProducto).eq("id", existente.id);
        if (error) throw new Error(error.message);
        productoId = existente.id;
        actualizados++;
      } else {
        const { data, error } = await db().from("productos").insert(filaProducto).select("id").single();
        if (error) throw new Error(error.message);
        productoId = data.id;
        creados++;
      }

      if (cantBodega > 0 || cantExhibicion > 0) {
        // Guard anti-doble-carga: si ya tiene inventario inicial, rechaza las cantidades
        const { data: yaInicial } = await db()
          .from("inventario_movimientos").select("id")
          .eq("producto_id", productoId).eq("tipo", "inventario_inicial").limit(1);
        if (yaInicial?.length) {
          throw new Error(`"${nombre}" ya tiene carga inicial; usa Ingreso de mercancía o Ajuste.`);
        }

        const provTexto = f.proveedor?.trim().toLowerCase();
        const prov = provTexto
          ? proveedores?.find(p => p.nit?.toLowerCase() === provTexto || p.nombre.toLowerCase() === provTexto)
          : null;
        const costo = Number(f.costo_unitario) || Number(f.precio_compra) || 0;

        for (const [ubicacionId, cantidad] of [[idBodega, cantBodega], [idExhibicion, cantExhibicion]] as [number | undefined, number][]) {
          if (!cantidad || !ubicacionId) continue;
          const { error } = await db().rpc("ingresar_inventario", {
            p_producto_id: productoId,
            p_ubicacion_id: ubicacionId,
            p_cantidad: cantidad,
            p_costo_unitario: costo,
            p_tipo: "inventario_inicial",
            p_referencia: `Carga inicial ${new Date().toISOString().slice(0, 10)}`,
            p_proveedor_id: prov?.id || null,
            p_numero_factura: f.numero_factura?.trim() || null,
            p_lote: null,
            p_motivo: f.observaciones?.trim() || null,
            p_usuario: sesion.usuario,
          });
          if (error) throw new Error(error.message);
        }
        ingresados++;
      }
    } catch (e) {
      errores.push({ fila: f.fila, mensaje: (e as Error).message });
    }
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "crear",
    entidad_tipo: "inventario_movimientos", entidad_id: 0,
    descripcion: `Importación masiva de inventario: ${creados} creados, ${actualizados} actualizados, ${ingresados} con carga inicial, ${errores.length} errores`,
    datos_nuevos: { creados, actualizados, ingresados, errores },
  });

  revalidarInventario();
  return { creados, actualizados, ingresados, errores };
}
