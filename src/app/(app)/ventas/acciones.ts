"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarClaveAutorizada } from "@/lib/pin";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";
import type { Cliente } from "@/lib/tipos";

export type LineaVenta = {
  producto: string;
  cantidad: number;
  valor_unitario: number;
  talla?: string;
  color?: string;
  sexo?: string;
  estampado?: string;
  bordado?: string;
  guia_estampado?: string;
  guia_bordado?: string;
  imagen_estampado_url?: string | null;
  imagen_bordado_url?: string | null;
  /** Venta sin inventario: permite vender aunque no haya stock disponible (queda pendiente por surtir). */
  sin_inventario?: boolean;
};

export type NuevaVenta = {
  cliente_id: number;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
  /** Orden de compra / pedido que envía el cliente (opcional). */
  orden_compra_cliente?: string;
  lineas: LineaVenta[];
  abono: number;
  cuenta_id?: number | null;
  costo_envio?: number;
  estado_pago?: string;
  medio_pago?: string;
  tipo_pago?: string;
  fecha_pago?: string;
  estado_entrega?: string;
  fecha_entrega?: string;
  observaciones_pago?: string;
};

type MatchInventario = { id: number; sku: string | null; controla_inventario: boolean; es_servicio: boolean };

/** Empareja las líneas (texto libre) con el catálogo de productos por nombre exacto. */
async function matchesInventario(lineas: LineaVenta[]): Promise<Map<string, MatchInventario>> {
  const nombres = [...new Set(lineas.map(l => l.producto.trim()))];
  if (!nombres.length) return new Map();
  const { data } = await db()
    .from("productos")
    .select("id, nombre, sku, controla_inventario, es_servicio")
    .in("nombre", nombres);
  return new Map((data || []).map(p => [p.nombre as string, {
    id: p.id as number, sku: (p.sku as string) || null,
    controla_inventario: !!p.controla_inventario, es_servicio: !!p.es_servicio,
  }]));
}

/**
 * Costo unitario de receta de los productos vendidos, para CONGELARLO en la
 * venta. Así actualizar una receta no altera la utilidad histórica.
 * Best-effort: si falta la migración 026 no hay costo y la venta sigue normal.
 */
async function costosDeReceta(matches: Map<string, MatchInventario>): Promise<Map<number, number>> {
  const ids = [...matches.values()].map(m => m.id);
  if (!ids.length) return new Map();
  try {
    const { data, error } = await db().from("recetas").select("producto_id, costo_total").in("producto_id", ids);
    if (error) return new Map();
    return new Map((data || []).map(r => [r.producto_id as number, Number(r.costo_total) || 0]));
  } catch {
    return new Map();
  }
}

/**
 * Distingue un fallo de infraestructura (RPC/tabla ausente o caché de esquema
 * desactualizada, típico si falta correr una migración) de un error de negocio
 * (ej. stock insuficiente). Los primeros NO deben impedir registrar la venta.
 */
function esFalloDeInfraestructura(mensaje: string): boolean {
  const m = (mensaje || "").toLowerCase();
  return m.includes("could not find the function") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    m.includes("no existe") ||
    m.includes("could not choose the best candidate") ||
    m.includes("pgrst202") ||
    m.includes("pgrst203");
}

/**
 * Crea/actualiza las reservas de inventario de la venta (solo líneas con match inventariado).
 * Devuelve `{ error }` para fallos de negocio (bloquean la venta) o `{ aviso }` cuando el
 * inventario no está disponible por infraestructura (la venta continúa sin reserva).
 */
async function reservarInventarioVenta(
  ventaId: number, lineas: LineaVenta[], matches: Map<string, MatchInventario>, usuario: string | null,
): Promise<{ error?: string; aviso?: string }> {
  const lineasReserva = lineas
    .map(l => {
      const m = matches.get(l.producto.trim());
      if (!m || !m.controla_inventario || m.es_servicio) return null;
      // Nativo produce por encargo: la falta de stock NUNCA bloquea la venta.
      // Lo que falte queda como "pendiente por surtir" y se descuenta solo
      // cuando entre la mercancía (surtir_pendientes, FIFO).
      return { producto_id: m.id, cantidad: Number(l.cantidad) || 0, permitir_faltante: true };
    })
    .filter((x): x is { producto_id: number; cantidad: number; permitir_faltante: boolean } => x !== null);

  // Se llama siempre (aunque no haya líneas inventariadas) para cancelar reservas viejas al editar
  const { error } = await db().rpc("reservar_venta", {
    p_venta_id: ventaId,
    p_lineas: lineasReserva,
    p_usuario: usuario,
  });
  if (!error) return {};

  if (esFalloDeInfraestructura(error.message)) {
    console.error("[ventas] reserva de inventario omitida (módulo de inventario no disponible):", error.message);
    return { aviso: "La venta se registró, pero no se reservó inventario porque el módulo de inventario no está disponible." };
  }
  return { error: error.message };
}

function filaDetalle(ventaId: number, l: LineaVenta, sku?: string | null, costoUnitario?: number | null) {
  const cantidad = Number(l.cantidad) || 1;
  return {
    venta_id: ventaId,
    producto: l.producto.trim(),
    codigo_producto: sku || null,
    cantidad,
    valor_unitario: Number(l.valor_unitario) || 0,
    valor_total: cantidad * (Number(l.valor_unitario) || 0),
    // Costo congelado desde la receta. null cuando el producto no tiene receta:
    // así la utilidad queda vacía en vez de aparentar un costo de cero.
    costo_unitario: costoUnitario != null ? costoUnitario : null,
    costo_total: costoUnitario != null ? Math.round(cantidad * costoUnitario * 100) / 100 : null,
    talla: l.talla || null, color: l.color || null, sexo: l.sexo || null,
    estampado: l.estampado || null, bordado: l.bordado || null,
    guia_estampado: l.guia_estampado || null, guia_bordado: l.guia_bordado || null,
    imagen_estampado_url: l.imagen_estampado_url || null,
    imagen_bordado_url: l.imagen_bordado_url || null,
  };
}

/**
 * Resultado de registrar una venta. Se devuelve como VALOR (no se lanza) porque en
 * producción Next.js enmascara los errores lanzados desde un Server Action y el
 * usuario solo vería un mensaje genérico sin la causa real.
 */
export type ResultadoVenta =
  | { ok: true; ticket: number; aviso?: string }
  | { ok: false; error: string };

async function registrarVentaInterno(venta: NuevaVenta): Promise<ResultadoVenta> {
  const sesion = await requierePermiso("ventas");
  if (!venta.cliente_id) return { ok: false, error: "Selecciona un cliente." };
  const lineas = (venta.lineas || []).filter(l => l.producto?.trim());
  if (!lineas.length) return { ok: false, error: "Agrega al menos un producto." };
  let aviso: string | undefined;

  // Ticket siguiente de la secuencia normal (los tickets de 6 dígitos son históricos migrados)
  const { data: maxData, error: errMax } = await db()
    .from("ventas").select("ticket").lt("ticket", 100000)
    .order("ticket", { ascending: false }).limit(1);
  if (errMax) return { ok: false, error: errMax.message };
  const ticket = ((maxData?.[0]?.ticket as number) || 0) + 1;

  const costoEnvio = Number(venta.costo_envio) || 0;
  const totalProductos = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0);
  const total = totalProductos + costoEnvio;
  const abono = Number(venta.abono) || 0;

  const { data: cab, error: errCab } = await db().from("ventas").insert({
    ticket,
    fecha: new Date().toISOString().slice(0, 10),
    cliente_id: venta.cliente_id,
    canal_venta: venta.canal_venta || null,
    campana: venta.campana || null,
    vendedora: venta.vendedora || null,
    profesional: venta.profesional || null,
    motivo_compra: venta.motivo_compra || null,
    orden_compra_cliente: venta.orden_compra_cliente?.trim() || null,
    total_compra: total,
    costo_envio: costoEnvio,
    retencion: 0,
    total_a_pagar: total,
    abono: 0, // el abono inicial se aplica vía RPC registrar_pago más abajo
    saldo: total,
    estado_pago: abono > 0 ? "Pendiente" : (venta.estado_pago || "Pendiente"),
    fecha_pago: venta.fecha_pago || null,
    tipo_pago: venta.tipo_pago || null,
    medio_pago: venta.medio_pago || null,
    observaciones_pago: venta.observaciones_pago || null,
    estado_entrega: venta.estado_entrega || "En Proceso",
    fecha_entrega: venta.fecha_entrega || null,
  }).select("id, ticket").single();
  if (errCab) return { ok: false, error: errCab.message };

  const matches = await matchesInventario(lineas);
  const costos = await costosDeReceta(matches);
  const { error: errDet } = await db().from("ventas_detalle").insert(
    lineas.map(l => {
      const m = matches.get(l.producto.trim());
      return filaDetalle(cab.id, l, m?.sku, m ? costos.get(m.id) ?? null : null);
    })
  );
  if (errDet) {
    await db().from("ventas").delete().eq("id", cab.id); // rollback manual de la cabecera
    return { ok: false, error: errDet.message };
  }

  // Reserva de inventario: un error de negocio (ej. sin stock) revierte la venta;
  // un fallo de infraestructura solo deja un aviso y la venta se registra igual.
  const reserva = await reservarInventarioVenta(cab.id, lineas, matches, sesion.usuario);
  if (reserva.error) {
    await db().from("ventas").delete().eq("id", cab.id);
    return { ok: false, error: reserva.error };
  }
  if (reserva.aviso) aviso = reserva.aviso;

  if (abono > 0) {
    // RPC transaccional: crea el pago, recalcula la cabecera y (si hay cuenta) el movimiento bancario
    const { error: errPago } = await db().rpc("registrar_pago", {
      p_venta_id: cab.id,
      p_abono: abono,
      p_retencion: 0,
      p_fecha: venta.fecha_pago || new Date().toISOString().slice(0, 10),
      p_comentario: "Abono inicial al registrar la venta",
      p_usuario: sesion.usuario,
      p_cuenta_id: venta.cuenta_id || null,
    });
    // La venta ya existe: no se revierte. Se avisa para que el abono se registre desde Pagos.
    if (errPago) {
      console.error("[ventas] abono inicial falló:", errPago.message);
      aviso = `La venta se registró, pero el abono inicial no se aplicó (${errPago.message}). Regístralo desde el módulo Pagos.`;
    }
  }

  // Registrar productos nuevos en el catálogo
  for (const l of lineas) {
    await db().from("productos").upsert({ nombre: l.producto.trim() }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "ventas", accion: "crear",
    entidad_tipo: "ventas", entidad_id: cab.id,
    descripcion: descripcionTicket("Venta", cab.ticket, total),
    datos_nuevos: { ...venta, ticket: cab.ticket, total, lineas },
  });

  revalidatePath("/ventas");
  revalidatePath("/inventario");
  revalidatePath("/");
  return { ok: true, ticket: cab.ticket as number, aviso };
}

export async function registrarVenta(venta: NuevaVenta): Promise<ResultadoVenta> {
  try {
    return await registrarVentaInterno(venta);
  } catch (e) {
    // Registrar la causa real en los logs del servidor: en producción Next.js
    // enmascara el mensaje de cualquier error lanzado desde un Server Action.
    const mensaje = e instanceof Error ? e.message : "Error inesperado al registrar la venta.";
    console.error("[ventas] registrarVenta falló:", mensaje);
    return { ok: false, error: mensaje };
  }
}

export async function actualizarVenta(datos: {
  venta_id: number;
  pin: string;
  cliente_id?: number;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
  orden_compra_cliente?: string;
  fecha_entrega?: string;
  costo_envio?: number;
  lineas: LineaVenta[];
}) {
  const sesion = await requierePermiso("ventas");
  try {
    const autorizo = await verificarClaveAutorizada(datos.pin);
    const lineas = (datos.lineas || []).filter(l => l.producto?.trim());
    if (!lineas.length) throw new Error("La venta debe tener al menos un producto.");

    const { data: venta, error: errGet } = await db()
      .from("ventas").select("*").eq("id", datos.venta_id).single();
    if (errGet) throw new Error(errGet.message);
    const { data: lineasAntes } = await db().from("ventas_detalle").select("*").eq("venta_id", datos.venta_id);

    const costoEnvio = Number(datos.costo_envio) || 0;
    const totalProductos = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.valor_unitario) || 0), 0);
    const total = totalProductos + costoEnvio;
    const totalAPagar = total - Number(venta.retencion || 0);
    const saldo = totalAPagar - Number(venta.abono || 0);

    // Reserva de inventario primero: si no hay stock (y no se marcó "venta sin
    // inventario"), aborta ANTES de tocar las líneas
    const matches = await matchesInventario(lineas);
    const reserva = await reservarInventarioVenta(datos.venta_id, lineas, matches, sesion.usuario);
    if (reserva.error) throw new Error(reserva.error);

    // Reemplaza el detalle completo
    const { error: errDel } = await db().from("ventas_detalle").delete().eq("venta_id", datos.venta_id);
    if (errDel) throw new Error(errDel.message);
    const costos = await costosDeReceta(matches);
    const nuevasLineas = lineas.map(l => {
      const m = matches.get(l.producto.trim());
      return filaDetalle(datos.venta_id, l, m?.sku, m ? costos.get(m.id) ?? null : null);
    });
    const { error: errIns } = await db().from("ventas_detalle").insert(nuevasLineas);
    if (errIns) throw new Error(errIns.message);

    const camposActualizados = {
      cliente_id: datos.cliente_id || venta.cliente_id,
      canal_venta: datos.canal_venta || null,
      campana: datos.campana || null,
      vendedora: datos.vendedora || null,
      profesional: datos.profesional || null,
      motivo_compra: datos.motivo_compra || null,
      orden_compra_cliente: datos.orden_compra_cliente?.trim() || null,
      fecha_entrega: datos.fecha_entrega || null,
      costo_envio: costoEnvio,
      total_compra: total,
      total_a_pagar: totalAPagar,
      saldo,
      estado_pago: saldo <= 0 && total > 0 ? "Pagado Total" : Number(venta.abono) > 0 ? "Abonado" : "Pendiente",
    };
    const { error: errUpd } = await db().from("ventas").update(camposActualizados).eq("id", datos.venta_id);
    if (errUpd) throw new Error(errUpd.message);

    for (const l of lineas) {
      await db().from("productos").upsert({ nombre: l.producto.trim() }, { onConflict: "nombre", ignoreDuplicates: true });
    }

    await registrarBitacora({
      usuario: sesion.usuario, modulo: "ventas", accion: "editar",
      entidad_tipo: "ventas", entidad_id: datos.venta_id,
      descripcion: `${descripcionTicket("Venta", venta.ticket, total)} — autorizó ${autorizo}`,
      datos_anteriores: { ...venta, lineas: lineasAntes || [] },
      datos_nuevos: { ...venta, ...camposActualizados, lineas: nuevasLineas, autorizado_con: autorizo },
    });

    revalidatePath("/ventas");
    revalidatePath("/pagos");
    revalidatePath("/inventario");
    revalidatePath("/");
    return { ticket: venta.ticket as number };
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("No se pudo actualizar la venta. Intenta de nuevo.");
  }
}

export async function actualizarClienteVenta(datos: Partial<Cliente> & { id: number; nombre: string }) {
  const sesion = await requierePermiso("ventas");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  const fila = {
    nombre: datos.nombre.trim(),
    cedula_nit: datos.cedula_nit?.trim() || null,
    empresa: datos.empresa?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    correo: datos.correo?.trim() || null,
    rut: datos.rut?.trim() || null,
    digito_verificacion: datos.digito_verificacion?.trim() || null,
  };
  const { data: anterior } = await db().from("clientes").select("*").eq("id", datos.id).single();
  const { error } = await db().from("clientes").update(fila).eq("id", datos.id);
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "clientes", accion: "editar",
    entidad_tipo: "clientes", entidad_id: datos.id,
    descripcion: `Cliente: ${fila.nombre}`,
    datos_anteriores: anterior ?? null, datos_nuevos: fila,
  });
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  return { ...anterior, ...fila, id: datos.id };
}

export async function eliminarVenta(ventaId: number, pin: string) {
  const sesion = await requierePermiso("ventas");
  const autorizo = await verificarClaveAutorizada(pin);

  const [{ data: venta }, { data: detalle }, { data: pagos }, { data: historial }] = await Promise.all([
    db().from("ventas").select("*").eq("id", ventaId).single(),
    db().from("ventas_detalle").select("*").eq("venta_id", ventaId),
    db().from("pagos").select("*").eq("venta_id", ventaId),
    db().from("historial_entregas").select("*").eq("venta_id", ventaId),
  ]);

  const { error } = await db().from("ventas").delete().eq("id", ventaId);
  if (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar: esta venta tiene devoluciones registradas.");
    throw new Error(error.message);
  }

  if (venta) {
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "ventas", accion: "eliminar",
      entidad_tipo: "ventas", entidad_id: ventaId,
      descripcion: `${descripcionTicket("Venta", venta.ticket, venta.total_compra)} — autorizó ${autorizo}`,
      datos_anteriores: { ...venta, lineas: detalle || [], pagos: pagos || [], historial: historial || [] },
    });
  }

  revalidatePath("/ventas");
  revalidatePath("/pagos");
  revalidatePath("/entregas");
  revalidatePath("/seguimiento");
  revalidatePath("/financiero");
  revalidatePath("/");
}

const TIPOS_ARCHIVO_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "application/pdf"];
const TAMANO_MAXIMO = 5 * 1024 * 1024;

export async function subirImagenLinea(formData: FormData) {
  await requierePermiso("ventas");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) throw new Error("Archivo inválido.");
  if (!TIPOS_ARCHIVO_PERMITIDOS.includes(archivo.type)) throw new Error("Solo se permiten imágenes (PNG, JPG, WEBP, HEIC) o archivos PDF.");
  if (archivo.size > TAMANO_MAXIMO) throw new Error("El archivo no debe superar 5MB.");

  const ext = archivo.name.split(".").pop() || "jpg";
  const ruta = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await db().storage.from("guias").upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);

  const { data } = db().storage.from("guias").getPublicUrl(ruta);
  return data.publicUrl;
}

export async function crearCliente(datos: {
  nombre: string; cedula_nit?: string; empresa?: string; contacto?: string;
  ciudad?: string; departamento?: string; direccion?: string; correo?: string; rut?: string; digito_verificacion?: string;
}) {
  const sesion = await requierePermiso("ventas");
  if (!datos.nombre?.trim()) throw new Error("El nombre es obligatorio.");
  if (datos.cedula_nit?.trim()) {
    const { data: dup } = await db().from("clientes").select("id").eq("cedula_nit", datos.cedula_nit.trim()).maybeSingle();
    if (dup) throw new Error("Ya existe un cliente con esa cédula/NIT.");
  }
  const fila = {
    nombre: datos.nombre.trim(),
    cedula_nit: datos.cedula_nit?.trim() || null,
    empresa: datos.empresa?.trim() || null,
    contacto: datos.contacto?.trim() || null,
    ciudad: datos.ciudad?.trim() || null,
    departamento: datos.departamento?.trim() || null,
    direccion: datos.direccion?.trim() || null,
    correo: datos.correo?.trim() || null,
    rut: datos.rut?.trim() || null,
    digito_verificacion: datos.digito_verificacion?.trim() || null,
  };
  const { data, error } = await db().from("clientes").insert(fila).select().single();
  if (error) throw new Error(error.message);
  await registrarBitacora({
    usuario: sesion.usuario, modulo: "clientes", accion: "crear",
    entidad_tipo: "clientes", entidad_id: data.id,
    descripcion: `Cliente creado: ${fila.nombre}`,
    datos_nuevos: fila,
  });
  revalidatePath("/ventas");
  revalidatePath("/clientes");
  return data;
}
