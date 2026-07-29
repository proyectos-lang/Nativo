"use server";

import { db } from "@/lib/db";
import { requierePermiso } from "@/lib/sesion";
import { verificarPin } from "@/lib/pin";
import { registrarBitacora, descripcionTicket } from "@/lib/bitacora";
import { revalidatePath } from "next/cache";

export async function registrarPago(datos: {
  venta_id: number;
  abono: number;
  retefuente?: number;
  reteiva?: number;
  reteica?: number;
  fecha?: string;
  comentario?: string;
  cuenta_id?: number | null;
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

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "pagar",
    entidad_tipo: "ventas", entidad_id: datos.venta_id,
    descripcion: descripcionTicket("Abono Venta", data?.ticket, abono),
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
 * Corrige un abono ya registrado. Exige la clave de autorización (gerencia)
 * porque toca dinero ya contabilizado: reajusta el saldo de la venta y rehace
 * el movimiento bancario.
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
  await verificarPin(datos.pin);

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
    descripcion: descripcionTicket("Abono editado — Venta", data?.ticket, abono),
    datos_anteriores: anterior ?? null,
    datos_nuevos: { abono, retefuente, reteiva, reteica, fecha: datos.fecha, comentario: datos.comentario, cuenta_id: datos.cuenta_id, venta_resultante: data },
  });

  revalidarPagos();
  return data;
}

/** Anula (elimina) un abono y devuelve el saldo de la venta a su estado previo. */
export async function anularPago(pagoId: number, pin: string, motivo?: string) {
  const sesion = await requierePermiso("pagos");
  await verificarPin(pin);

  const { data: anterior } = await db().from("pagos").select("*").eq("id", pagoId).single();

  const { data, error } = await db().rpc("anular_pago", {
    p_pago_id: pagoId,
    p_usuario: sesion.usuario,
  });
  if (error) throw new Error(error.message);

  await registrarBitacora({
    usuario: sesion.usuario, modulo: "pagos", accion: "anular",
    entidad_tipo: "pagos", entidad_id: pagoId,
    descripcion: descripcionTicket("Abono anulado — Venta", data?.ticket, anterior?.abono),
    datos_anteriores: anterior ?? null,
    datos_nuevos: { venta_resultante: data },
    motivo: motivo?.trim() || null,
  });

  revalidarPagos();
  return data;
}
