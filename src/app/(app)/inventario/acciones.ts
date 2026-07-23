"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarPin } from "@/lib/pin";
import { registrarBitacora } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import { formatoPesos, type Producto } from "@/lib/tipos";

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

/**
 * Asegura que el producto pueda participar en inventario antes de operarlo:
 * un servicio se rechaza (no maneja stock), y un producto no enrolado se
 * enrola automáticamente (controla_inventario = true) al primer movimiento.
 * Así el catálogo de Productos y los selectores de operación quedan alineados.
 */
async function asegurarEnrolado(productoId: number) {
  const { data: prod, error } = await db().from("productos").select("nombre, es_servicio, controla_inventario").eq("id", productoId).single();
  if (error) throw new Error(error.message);
  if (prod.es_servicio) throw new Error(`El producto "${prod.nombre}" es un servicio: no maneja inventario.`);
  if (!prod.controla_inventario) {
    const { error: e2 } = await db().from("productos").update({ controla_inventario: true }).eq("id", productoId);
    if (e2) throw new Error(e2.message);
  }
}

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
  await asegurarEnrolado(datos.producto_id);
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
  await asegurarEnrolado(datos.producto_id);
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
  await asegurarEnrolado(datos.producto_id);
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
  await asegurarEnrolado(datos.producto_id);
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

// ------------------------------------------------------------
// ARQUEOS (conteos físicos con cuadre autorizado por gerencia)
// ------------------------------------------------------------

export async function abrirArqueo(datos: {
  categoria?: string;
  ubicacion_id?: number;
  observaciones?: string;
}) {
  const sesion = await requierePermiso("inventario");

  const { data: maxData, error: errMax } = await db().from("arqueos").select("numero").order("numero", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
  const numero = ((maxData?.[0]?.numero as number) || 0) + 1;

  // Alcance del conteo: productos con control de inventario (filtrados por categoría)
  let qProds = db().from("productos").select("id, nombre, sku, categoria, costo_promedio").eq("controla_inventario", true).eq("estado", "Activo");
  if (datos.categoria?.trim()) qProds = qProds.eq("categoria", datos.categoria.trim());
  const [{ data: prods, error: errProds }, { data: ubicaciones, error: errUb }, { data: existencias, error: errEx }] = await Promise.all([
    qProds,
    db().from("inventario_ubicaciones").select("id, nombre").eq("activa", true),
    db().from("inventario_existencias").select("*"),
  ]);
  if (errProds) throw new Error(errProds.message);
  if (errUb) throw new Error(errUb.message);
  if (errEx) throw new Error(errEx.message);
  if (!prods?.length) throw new Error("No hay productos con control de inventario en ese alcance.");

  const ubicacionesConteo = (ubicaciones || []).filter(u => !datos.ubicacion_id || u.id === datos.ubicacion_id);
  if (!ubicacionesConteo.length) throw new Error("Ubicación no encontrada.");

  const { data: arqueo, error: errArq } = await db().from("arqueos").insert({
    numero,
    categoria: datos.categoria?.trim() || null,
    ubicacion_id: datos.ubicacion_id || null,
    observaciones: datos.observaciones?.trim() || null,
    usuario_abre: sesion.usuario,
  }).select("id, numero").single();
  if (errArq) throw new Error(errArq.message);

  // Snapshot: una fila por producto × ubicación con la cantidad del sistema
  const filas = prods.flatMap(p => ubicacionesConteo.map(u => ({
    arqueo_id: arqueo.id,
    producto_id: p.id,
    producto: `${p.sku ? p.sku + " — " : ""}${p.nombre}`,
    ubicacion_id: u.id,
    ubicacion: u.nombre,
    cantidad_sistema: Number(existencias?.find(e => e.producto_id === p.id && e.ubicacion_id === u.id)?.cantidad) || 0,
    costo_unitario: Number(p.costo_promedio) || 0,
  })));
  const { error: errDet } = await db().from("arqueos_detalle").insert(filas);
  if (errDet) {
    await db().from("arqueos").delete().eq("id", arqueo.id);
    throw new Error(errDet.message);
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "crear",
    entidad_tipo: "arqueos", entidad_id: arqueo.id,
    descripcion: `Arqueo #${numero} abierto (${filas.length} referencias × ubicación)${datos.categoria ? ` — categoría ${datos.categoria}` : ""}`,
    datos_nuevos: { ...datos, numero, filas: filas.length },
  });
  revalidarInventario();
  return { id: arqueo.id as number, numero: arqueo.numero as number };
}

export async function registrarConteo(arqueoId: number, filas: { detalle_id: number; cantidad_fisica: number }[]) {
  const sesion = await requierePermiso("inventario");
  const { data: arqueo, error: errGet } = await db().from("arqueos").select("estado, numero").eq("id", arqueoId).single();
  if (errGet) throw new Error(errGet.message);
  if (arqueo.estado !== "Abierto") throw new Error(`El arqueo #${arqueo.numero} ya está ${arqueo.estado}.`);

  const validas = (filas || []).filter(f => f.cantidad_fisica != null && Number(f.cantidad_fisica) >= 0);
  if (!validas.length) throw new Error("No hay conteos para guardar.");

  for (const f of validas) {
    const { data: det } = await db().from("arqueos_detalle").select("cantidad_sistema").eq("id", f.detalle_id).eq("arqueo_id", arqueoId).single();
    if (!det) continue;
    const fisica = Number(f.cantidad_fisica);
    await db().from("arqueos_detalle").update({
      cantidad_fisica: fisica,
      diferencia: fisica - Number(det.cantidad_sistema),
      contado_en: new Date().toISOString(),
      usuario: sesion.usuario,
    }).eq("id", f.detalle_id);
  }

  revalidarInventario();
}

export async function cerrarArqueo(arqueoId: number, pin: string) {
  const sesion = await requierePermiso("inventario");
  await verificarPin(pin); // Autorización explícita de gerencia

  const { data, error } = await db().rpc("cerrar_arqueo", {
    p_arqueo_id: arqueoId,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);
  const resultado = Array.isArray(data) ? data[0] : data;
  const ajustados = Number(resultado?.ajustados) || 0;
  const valor = Number(resultado?.valor_diferencia) || 0;

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "cerrar_arqueo",
    entidad_tipo: "arqueos", entidad_id: arqueoId,
    descripcion: `Arqueo cerrado y cuadrado: ${ajustados} ajuste${ajustados === 1 ? "" : "s"}, diferencia valorizada ${formatoPesos(valor)}`,
    datos_nuevos: { ajustados, valor_diferencia: valor },
  });
  revalidarInventario();
  return { ajustados, valor_diferencia: valor };
}

export async function anularArqueo(arqueoId: number, pin: string) {
  const sesion = await requierePermiso("inventario");
  await verificarPin(pin);
  const { data: arqueo, error: errGet } = await db().from("arqueos").select("estado, numero").eq("id", arqueoId).single();
  if (errGet) throw new Error(errGet.message);
  if (arqueo.estado !== "Abierto") throw new Error(`El arqueo #${arqueo.numero} ya está ${arqueo.estado}.`);

  const { error } = await db().from("arqueos").update({ estado: "Anulado", fecha_cierre: new Date().toISOString(), usuario_cierra: sesion.usuario }).eq("id", arqueoId);
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "cambiar_estado",
    entidad_tipo: "arqueos", entidad_id: arqueoId,
    descripcion: `Arqueo #${arqueo.numero} anulado (sin aplicar ajustes)`,
    datos_nuevos: { estado: "Anulado" },
  });
  revalidarInventario();
}

// ------------------------------------------------------------
// BODEGAS / UBICACIONES (administrables). No se borran: se
// inactivan (la tabla es referenciada por FK desde existencias,
// movimientos y arqueos). Una ubicación inactiva desaparece de
// los selectores sin afectar el historial (nombre copiado).
// ------------------------------------------------------------

export async function crearUbicacion(nombre: string) {
  const sesion = await requierePermiso("inventario");
  const limpio = nombre?.trim();
  if (!limpio) throw new Error("El nombre de la bodega es obligatorio.");
  const { data, error } = await db().from("inventario_ubicaciones").insert({ nombre: limpio }).select("id").single();
  if (error) throw new Error(error.message.includes("duplicate") ? "Ya existe una bodega con ese nombre." : error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "crear",
    entidad_tipo: "inventario_ubicaciones", entidad_id: data.id,
    descripcion: `Bodega creada: ${limpio}`,
    datos_nuevos: { nombre: limpio },
  });
  revalidarInventario();
}

export async function actualizarUbicacion(id: number, datos: { nombre?: string; activa?: boolean }) {
  const sesion = await requierePermiso("inventario");
  const { data: anterior, error: errGet } = await db().from("inventario_ubicaciones").select("*").eq("id", id).single();
  if (errGet) throw new Error(errGet.message);

  const cambios: { nombre?: string; activa?: boolean } = {};
  if (datos.nombre !== undefined) {
    const limpio = datos.nombre.trim();
    if (!limpio) throw new Error("El nombre no puede quedar vacío.");
    const { data: dup } = await db().from("inventario_ubicaciones").select("id").eq("nombre", limpio).neq("id", id).maybeSingle();
    if (dup) throw new Error("Ya existe una bodega con ese nombre.");
    cambios.nombre = limpio;
  }
  if (datos.activa !== undefined) cambios.activa = datos.activa;
  if (!Object.keys(cambios).length) throw new Error("Nada que actualizar.");

  const { error } = await db().from("inventario_ubicaciones").update(cambios).eq("id", id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "inventario", accion: "editar",
    entidad_tipo: "inventario_ubicaciones", entidad_id: id,
    descripcion: cambios.nombre !== undefined
      ? `Bodega renombrada: "${anterior.nombre}" → "${cambios.nombre}"`
      : `Bodega "${anterior.nombre}" ${cambios.activa ? "activada" : "inactivada"}`,
    datos_anteriores: anterior, datos_nuevos: { ...anterior, ...cambios },
  });
  revalidarInventario();
}

// ------------------------------------------------------------
// PROVEEDOR al vuelo (desde el Ingreso de mercancía). Duplicado
// del de Financiero pero gateado por el permiso "inventario",
// para que un usuario de inventario pueda crearlo sin permiso
// financiero.
// ------------------------------------------------------------

export async function crearProveedor(datos: {
  nombre: string; nit?: string; contacto?: string; correo?: string; ciudad?: string; departamento?: string; direccion?: string;
}) {
  const sesion = await requierePermiso("inventario");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  const fila = {
    nombre: datos.nombre.trim(),
    nit: datos.nit?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    correo: datos.correo?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
  };
  const { data, error } = await db().from("proveedores").insert(fila).select().single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "proveedores", accion: "crear",
    entidad_tipo: "proveedores", entidad_id: data.id,
    descripcion: `Proveedor creado: ${fila.nombre}`,
    datos_nuevos: fila,
  });
  revalidatePath("/inventario");
  revalidatePath("/proveedores");
  return data;
}
