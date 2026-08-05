"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarClaveAutorizada, ETIQUETA_CLAVE } from "@/lib/pin";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

/** Comprobante ya subido, listo para asociarse a un abono. */
export type SoporteNuevo = { url: string; nombre_archivo?: string | null; tipo_archivo?: string | null };

export async function registrarPago(datos: {
  venta_id: number;
  abono: number;
  retefuente?: number;
  reteiva?: number;
  reteica?: number;
  fecha?: string;
  comentario?: string;
  cuenta_id?: number | null;
  soportes?: SoporteNuevo[];
}) {
  const sesion = await requierePermiso("pagos");
  const abono = Number(datos.abono) || 0;
  const retefuente = Math.max(Number(datos.retefuente) || 0, 0);
  const reteiva = Math.max(Number(datos.reteiva) || 0, 0);
  const reteica = Math.max(Number(datos.reteica) || 0, 0);
  const retencion = retefuente + reteiva + reteica;
  if (abono <= 0 && retencion <= 0) throw new Error("Ingresa un valor de abono o de alguna retención.");

  const { data, error } = await db().rpc("registrar_pago", {
    p_venta_id: datos.venta_id,
    p_abono: abono,
    p_retencion: 0,
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario || null,
    p_usuario: sesion.usuario,
    p_cuenta_id: datos.cuenta_id || null,
    p_retefuente: retefuente,
    p_reteiva: reteiva,
    p_reteica: reteica,
  });
  if (error) throw new Error(error.message);

  // El RPC devuelve la venta, no el pago. Para colgarle los comprobantes se
  // busca el abono recién insertado: el más reciente de esta venta hecho por
  // este usuario. Best-effort — si algo falla, el pago ya quedó registrado y
  // los soportes se pueden adjuntar después desde el historial de abonos.
  const soportes = datos.soportes || [];
  if (soportes.length) {
    try {
      const { data: pago } = await db().from("pagos")
        .select("id").eq("venta_id", datos.venta_id).eq("usuario", sesion.usuario)
        .order("id", { ascending: false }).limit(1).maybeSingle();
      if (pago) {
        await db().from("pagos_soportes").insert(soportes.map(s => ({
          pago_id: pago.id,
          url: s.url,
          nombre_archivo: s.nombre_archivo || null,
          tipo_archivo: s.tipo_archivo || null,
          usuario: sesion.usuario,
        })));
      }
    } catch (e) {
      console.error("[pagos] el abono se registró pero no se pudieron adjuntar los soportes:", (e as Error).message);
    }
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "pagar",
    entidad_tipo: "ventas", entidad_id: datos.venta_id,
    descripcion: descripcionTicket("Abono Venta", data?.ticket, abono)
      + (soportes.length ? ` — ${soportes.length} soporte(s)` : ""),
    datos_nuevos: { ...datos, abono, retefuente, reteiva, reteica, retencion, venta_resultante: data },
  });

  revalidatePath("/pagos");
  revalidatePath("/financiero");
  revalidatePath("/");
  return data;
}

function revalidarPagos() {
  revalidatePath("/pagos");
  revalidatePath("/ventas");
  revalidatePath("/financiero");
  revalidatePath("/");
}

/**
 * Corrige un abono ya registrado. Exige clave de autorización porque toca
 * dinero ya contabilizado: reajusta el saldo de la venta. Sirve cualquiera de
 * las tres claves de autorización, y queda en la bitácora cuál se usó.
 */
export async function editarPago(datos: {
  pago_id: number;
  abono: number;
  retefuente?: number;
  reteiva?: number;
  reteica?: number;
  fecha?: string;
  comentario?: string;
  cuenta_id?: number | null;
  pin: string;
}) {
  const sesion = await requierePermiso("pagos");
  const autorizo = await verificarClaveAutorizada(datos.pin);

  const abono = Math.max(Number(datos.abono) || 0, 0);
  const retefuente = Math.max(Number(datos.retefuente) || 0, 0);
  const reteiva = Math.max(Number(datos.reteiva) || 0, 0);
  const reteica = Math.max(Number(datos.reteica) || 0, 0);
  if (abono <= 0 && retefuente + reteiva + reteica <= 0) {
    throw new Error("El pago debe tener un abono o alguna retención. Si quieres eliminarlo, usa Anular.");
  }

  const { data: anterior } = await db().from("pagos").select("*").eq("id", datos.pago_id).single();

  const { data, error } = await db().rpc("editar_pago", {
    p_pago_id: datos.pago_id,
    p_abono: abono,
    p_retefuente: retefuente,
    p_reteiva: reteiva,
    p_reteica: reteica,
    p_fecha: datos.fecha || null,
    p_comentario: datos.comentario || null,
    p_cuenta_id: datos.cuenta_id || null,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "editar",
    entidad_tipo: "pagos", entidad_id: datos.pago_id,
    descripcion: `${descripcionTicket("Abono editado — Venta", data?.ticket, abono)} — autorizó ${ETIQUETA_CLAVE[autorizo]}`,
    datos_anteriores: anterior ?? null,
    datos_nuevos: { abono, retefuente, reteiva, reteica, fecha: datos.fecha, comentario: datos.comentario, cuenta_id: datos.cuenta_id, autorizado_con: autorizo, venta_resultante: data },
  });

  revalidarPagos();
  return data;
}

/** Anula (elimina) un abono y devuelve el saldo de la venta a su estado previo. */
export async function anularPago(pagoId: number, pin: string, motivo?: string) {
  const sesion = await requierePermiso("pagos");
  const autorizo = await verificarClaveAutorizada(pin);

  const { data: anterior } = await db().from("pagos").select("*").eq("id", pagoId).single();

  const { data, error } = await db().rpc("anular_pago", {
    p_pago_id: pagoId,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "anular",
    entidad_tipo: "pagos", entidad_id: pagoId,
    descripcion: `${descripcionTicket("Abono anulado — Venta", data?.ticket, anterior?.abono)} — autorizó ${ETIQUETA_CLAVE[autorizo]}`,
    datos_anteriores: anterior ?? null,
    datos_nuevos: { autorizado_con: autorizo, venta_resultante: data },
    motivo: motivo?.trim() || null,
  });

  revalidarPagos();
  return data;
}

// ------------------------------------------------------------
// SOPORTES DE PAGO (comprobantes de cada abono) — migración 030
// ------------------------------------------------------------

const TIPOS_SOPORTE = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "application/pdf"];
const TAMANO_MAXIMO_SOPORTE = 5 * 1024 * 1024;

/**
 * Sube un comprobante al bucket `guias` bajo el prefijo `soportes/` y devuelve
 * su URL pública. La subida pasa siempre por el servidor: el navegador nunca
 * habla con Supabase. No toca la base de datos — asociar el archivo al abono
 * es trabajo de `adjuntarSoportePago` o de `registrarPago`.
 */
export async function subirSoportePago(formData: FormData) {
  await requierePermiso("pagos");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) throw new Error("Archivo inválido.");
  if (!TIPOS_SOPORTE.includes(archivo.type)) {
    throw new Error("Solo se permiten imágenes (PNG, JPG, WEBP, HEIC) o archivos PDF.");
  }
  if (archivo.size > TAMANO_MAXIMO_SOPORTE) throw new Error("El archivo no debe superar 5MB.");

  const ext = archivo.name.split(".").pop() || "jpg";
  const ruta = `soportes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await db().storage.from("guias").upload(ruta, archivo, { contentType: archivo.type });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);

  const { data } = db().storage.from("guias").getPublicUrl(ruta);
  return { url: data.publicUrl, nombre_archivo: archivo.name, tipo_archivo: archivo.type };
}

/** Asocia un comprobante ya subido a un abono existente. */
export async function adjuntarSoportePago(datos: { pago_id: number; soportes: SoporteNuevo[] }) {
  const sesion = await requierePermiso("pagos");
  const soportes = (datos.soportes || []).filter(s => s.url?.trim());
  if (!soportes.length) throw new Error("No hay archivos por adjuntar.");

  const { error } = await db().from("pagos_soportes").insert(soportes.map(s => ({
    pago_id: datos.pago_id,
    url: s.url.trim(),
    nombre_archivo: s.nombre_archivo || null,
    tipo_archivo: s.tipo_archivo || null,
    usuario: sesion.usuario,
  })));
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "editar",
    entidad_tipo: "pagos", entidad_id: datos.pago_id,
    descripcion: `${soportes.length} soporte(s) adjuntado(s) al abono #${datos.pago_id}`,
    datos_nuevos: { soportes },
  });
  revalidarPagos();
  return { adjuntados: soportes.length };
}

/**
 * Quita un comprobante. Borra también el archivo del bucket: es público, así
 * que dejarlo vivo tras eliminar el registro sería peor que borrarlo. La
 * bitácora conserva la URL para saber qué se quitó.
 */
export async function eliminarSoportePago(soporteId: number) {
  const sesion = await requierePermiso("pagos");
  const { data: soporte, error: errGet } = await db().from("pagos_soportes").select("*").eq("id", soporteId).single();
  if (errGet) throw new Error(errGet.message);

  const { error } = await db().from("pagos_soportes").delete().eq("id", soporteId);
  if (error) throw new Error(error.message);

  // El archivo, best-effort: si falla, el registro ya se quitó y el huérfano
  // en el bucket no rompe nada.
  try {
    const ruta = (soporte.url as string).split("/guias/")[1];
    if (ruta) await db().storage.from("guias").remove([decodeURIComponent(ruta)]);
  } catch (e) {
    console.error("[pagos] no se pudo borrar el archivo del bucket:", (e as Error).message);
  }

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "eliminar",
    entidad_tipo: "pagos", entidad_id: soporte.pago_id,
    descripcion: `Soporte eliminado del abono #${soporte.pago_id}: ${soporte.nombre_archivo || soporte.url}`,
    datos_anteriores: soporte,
  });
  revalidarPagos();
}
