"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarPin } from "@/lib/pin";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

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
};

export type NuevaVenta = {
  cliente_id: number;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
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

function filaDetalle(ventaId: number, l: LineaVenta) {
  return {
    venta_id: ventaId,
    producto: l.producto.trim(),
    cantidad: Number(l.cantidad) || 1,
    valor_unitario: Number(l.valor_unitario) || 0,
    valor_total: (Number(l.cantidad) || 1) * (Number(l.valor_unitario) || 0),
    talla: l.talla || null, color: l.color || null, sexo: l.sexo || null,
    estampado: l.estampado || null, bordado: l.bordado || null,
    guia_estampado: l.guia_estampado || null, guia_bordado: l.guia_bordado || null,
    imagen_estampado_url: l.imagen_estampado_url || null,
    imagen_bordado_url: l.imagen_bordado_url || null,
  };
}

export async function registrarVenta(venta: NuevaVenta) {
  const sesion = await requierePermiso("ventas");
  if (!venta.cliente_id) throw new Error("Selecciona un cliente.");
  const lineas = (venta.lineas || []).filter(l => l.producto?.trim());
  if (!lineas.length) throw new Error("Agrega al menos un producto.");

  // Ticket siguiente de la secuencia normal (los tickets de 6 dígitos son históricos migrados)
  const { data: maxData, error: errMax } = await db()
    .from("ventas").select("ticket").lt("ticket", 100000)
    .order("ticket", { ascending: false }).limit(1);
  if (errMax) throw new Error(errMax.message);
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
  if (errCab) throw new Error(errCab.message);

  const { error: errDet } = await db().from("ventas_detalle").insert(
    lineas.map(l => filaDetalle(cab.id, l))
  );
  if (errDet) {
    await db().from("ventas").delete().eq("id", cab.id); // rollback manual de la cabecera
    throw new Error(errDet.message);
  }

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
    if (errPago) throw new Error("Venta creada pero falló el abono inicial: " + errPago.message);
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
  revalidatePath("/");
  return { ticket: cab.ticket as number };
}

export async function actualizarVenta(datos: {
  venta_id: number;
  pin: string;
  canal_venta?: string;
  campana?: string;
  vendedora?: string;
  profesional?: string;
  motivo_compra?: string;
  fecha_entrega?: string;
  costo_envio?: number;
  lineas: LineaVenta[];
}) {
  const sesion = await requierePermiso("ventas");
  await verificarPin(datos.pin);
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

  // Reemplaza el detalle completo
  const { error: errDel } = await db().from("ventas_detalle").delete().eq("venta_id", datos.venta_id);
  if (errDel) throw new Error(errDel.message);
  const nuevasLineas = lineas.map(l => filaDetalle(datos.venta_id, l));
  const { error: errIns } = await db().from("ventas_detalle").insert(nuevasLineas);
  if (errIns) throw new Error(errIns.message);

  const camposActualizados = {
    canal_venta: datos.canal_venta || null,
    campana: datos.campana || null,
    vendedora: datos.vendedora || null,
    profesional: datos.profesional || null,
    motivo_compra: datos.motivo_compra || null,
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
    descripcion: descripcionTicket("Venta", venta.ticket, total),
    datos_anteriores: { ...venta, lineas: lineasAntes || [] },
    datos_nuevos: { ...venta, ...camposActualizados, lineas: nuevasLineas },
  });

  revalidatePath("/ventas");
  revalidatePath("/pagos");
  revalidatePath("/");
  return { ticket: venta.ticket as number };
}

export async function eliminarVenta(ventaId: number, pin: string) {
  const sesion = await requierePermiso("ventas");
  await verificarPin(pin);

  const [{ data: venta }, { data: detalle }, { data: pagos }, { data: historial }] = await Promise.all([
    db().from("ventas").select("*").eq("id", ventaId).single(),
    db().from("ventas_detalle").select("*").eq("venta_id", ventaId),
    db().from("pagos").select("*").eq("venta_id", ventaId),
    db().from("historial_entregas").select("*").eq("venta_id", ventaId),
  ]);

  const { error } = await db().from("ventas").delete().eq("id", ventaId);
  if (error) throw new Error(error.message);

  if (venta) {
    await registrarBitacora({
      usuario: sesion.usuario, modulo: "ventas", accion: "eliminar",
      entidad_tipo: "ventas", entidad_id: ventaId,
      descripcion: descripcionTicket("Venta", venta.ticket, venta.total_compra),
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
  ciudad?: string; departamento?: string; direccion?: string; correo?: string; rut?: string;
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
